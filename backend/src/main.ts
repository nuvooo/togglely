import { INestApplication, Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { AppModule } from './app.module'
import { SDK_ERROR_CODES } from './modules/sdk/sdk.constants'
import { SdkService } from './modules/sdk/sdk.service'
import {
  extractEffectiveBrandKey,
  extractSdkApiKey,
  extractSdkOrigin,
  mapSdkError,
  setSdkCorsHeaders,
} from './modules/sdk/sdk-http.utils'
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter'
import { MetricsService } from './shared/metrics/metrics.service'
import {
  assertSecureConfig,
  createIpRateLimiter,
  isOriginAllowed,
  isSdkPath,
  parseOriginList,
  redactUrl,
} from './shared/security/http-security'

async function bootstrap() {
  // Refuse to boot in production with a missing/weak JWT secret
  assertSecureConfig()

  const app = await NestFactory.create(AppModule)
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))
  const logger = new Logger('Bootstrap')
  const isProduction = process.env.NODE_ENV === 'production'
  const swaggerEnabled = !isProduction || process.env.ENABLE_SWAGGER === 'true'

  // Behind reverse proxies (Traefik/nginx) req.ip must be the real client IP,
  // otherwise all clients share one rate-limit bucket. By default only
  // private-network hops are trusted, so X-Forwarded-For cannot be spoofed.
  app
    .getHttpAdapter()
    .getInstance()
    .set(
      'trust proxy',
      process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal'
    )

  // Swagger UI needs relaxed CSP (inline scripts) — apply BEFORE helmet
  app.use((req: any, res: any, next: any) => {
    if (swaggerEnabled && req.path && req.path.startsWith('/api/swagger')) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; style-src * 'unsafe-inline'; img-src * data:; script-src * 'unsafe-inline'; connect-src *; font-src * data:"
      )
      return next()
    }
    return helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })(
      req,
      res,
      next
    )
  })

  // CORS for the dashboard API. SDK routes are called from customer websites
  // and are restricted per project via allowedOrigins instead.
  const corsOrigins = parseOriginList(process.env.CORS_ORIGINS)
  const allowAll = corsOrigins.includes('*')

  if (allowAll) {
    logger.warn('[CORS] CORS_ORIGINS=* allows every origin for the API')
  } else if (corsOrigins.length === 0) {
    logger.log(
      isProduction
        ? '[CORS] No CORS_ORIGINS configured: same-origin requests only'
        : '[CORS] No CORS_ORIGINS configured: allowing localhost (dev)'
    )
  }

  const corsHeaders = [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Requested-With',
  ]
  const apiCors = cors({
    origin: (origin, callback) => {
      // Requests without Origin (same-origin, curl, server-side)
      if (!origin || allowAll) return callback(null, true)

      if (!isProduction && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true)
      }

      if (isOriginAllowed(origin, corsOrigins)) return callback(null, true)

      logger.warn(`[CORS] Blocked origin: ${origin}`)
      // No CORS headers -> the browser blocks the response
      callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: corsHeaders,
  })
  const sdkCors = cors({
    origin: true,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: corsHeaders,
  })
  app.use((req: any, res: any, next: any) =>
    isSdkPath(req.path) ? sdkCors(req, res, next) : apiCors(req, res, next)
  )

  // Never log query strings (may contain API keys) or path tokens
  morgan.token('safe-url', (req: any) => redactUrl(req.originalUrl || req.url))
  app.use(
    morgan(
      ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":user-agent"'
    )
  )

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalFilters(new GlobalExceptionFilter())

  // Register standalone routes BEFORE global prefix
  const httpAdapter = app.getHttpAdapter()
  const sdkService = app.get(SdkService)

  // Health endpoint
  httpAdapter.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // Prometheus metrics endpoint (outside /api prefix). Protected by
  // METRICS_TOKEN; without a token it is disabled in production.
  const metricsService = app.get(MetricsService)
  const metricsToken = process.env.METRICS_TOKEN
  httpAdapter.get('/metrics', async (req, res) => {
    if (metricsToken) {
      if (req.headers.authorization !== `Bearer ${metricsToken}`) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
    } else if (isProduction) {
      return res.status(404).json({ error: 'Not found' })
    }
    const metrics = await metricsService.getMetrics()
    res.set('Content-Type', metricsService.getContentType())
    res.set('Cache-Control', 'no-store')
    res.send(metrics)
  })

  // SDK OPTIONS endpoints for CORS preflight
  httpAdapter.options('/sdk/flags/:projectKey/:environmentKey', (req, res) => {
    const origin = req.headers['origin'] as string | undefined
    setSdkCorsHeaders(res, origin)
    res.status(200).send()
  })
  httpAdapter.options(
    '/sdk/flags/:projectKey/:environmentKey/:flagKey',
    (req, res) => {
      const origin = req.headers['origin'] as string | undefined
      setSdkCorsHeaders(res, origin)
      res.status(200).send()
    }
  )

  // SDK endpoints registered as raw HTTP handlers — ThrottlerGuard (APP_GUARD)
  // does NOT apply here because these bypass the NestJS controller layer,
  // so they get their own per-IP limit.
  app.use(
    '/sdk',
    createIpRateLimiter({
      windowMs: 60_000,
      limit: Number(process.env.SDK_RATE_LIMIT_PER_MINUTE) || 600,
    })
  )

  // Get single flag - MUST be registered BEFORE the list endpoint!
  httpAdapter.get(
    '/sdk/flags/:projectKey/:environmentKey/:flagKey',
    async (req, res) => {
      const { projectKey, environmentKey, flagKey } = req.params
      const effectiveBrandKey = extractEffectiveBrandKey(req.query)
      const apiKey = extractSdkApiKey(req)
      const origin = extractSdkOrigin(req)

      // Always set CORS headers first
      setSdkCorsHeaders(res, origin)

      logger.debug(
        `[SDK] Request: /sdk/flags/${projectKey}/${environmentKey}/${flagKey}`
      )
      logger.debug(
        `[SDK] API Key present: ${!!apiKey}, Origin: ${origin || 'none'}`
      )

      try {
        if (!apiKey) {
          logger.debug('[SDK] ERROR: No API key provided')
          return res.status(401).json({
            error: 'API key required',
            code: SDK_ERROR_CODES.missingApiKey,
          })
        }

        const result = await sdkService.evaluateFlag(
          projectKey,
          environmentKey,
          flagKey,
          apiKey,
          effectiveBrandKey as string,
          origin
        )

        logger.debug(`[SDK] Success: ${flagKey} =`, result)
        res.json(result)
      } catch (error: any) {
        logger.error(`[SDK] Error for ${flagKey}:`, error.message)
        const response = mapSdkError(error)
        res.status(response.status).json(response.body)
      }
    }
  )

  // Get all flags for project/environment
  httpAdapter.get(
    '/sdk/flags/:projectKey/:environmentKey',
    async (req, res) => {
      const { projectKey, environmentKey } = req.params
      const effectiveBrandKey = extractEffectiveBrandKey(req.query)
      const apiKey = extractSdkApiKey(req)
      const origin = extractSdkOrigin(req)

      // Always set CORS headers first
      setSdkCorsHeaders(res, origin)

      logger.debug(`[SDK] Request: /sdk/flags/${projectKey}/${environmentKey}`)
      logger.debug(
        `[SDK] API Key present: ${!!apiKey}, Origin: ${origin || 'none'}`
      )

      try {
        if (!apiKey) {
          logger.debug('[SDK] ERROR: No API key provided')
          return res.status(401).json({
            error: 'API key required',
            code: SDK_ERROR_CODES.missingApiKey,
          })
        }

        const results = await sdkService.getAllFlags(
          projectKey,
          environmentKey,
          apiKey,
          effectiveBrandKey as string,
          origin
        )

        logger.debug(
          `[SDK] Success: ${Object.keys(results).length} flags returned`
        )
        res.json(results)
      } catch (error: any) {
        logger.error(`[SDK] Error:`, error.message)
        const response = mapSdkError(error)
        res.status(response.status).json(response.body)
      }
    }
  )

  // Set global prefix BEFORE creating Swagger document so paths are correct
  app.setGlobalPrefix('api')

  if (swaggerEnabled) {
    setupSwagger(app)
  }

  const port = process.env.PORT || 4000
  await app.listen(port, '0.0.0.0')
  logger.log(`🚀 Togglely API running on http://0.0.0.0:${port}`)
}

/** Swagger/OpenAPI docs; disabled in production unless ENABLE_SWAGGER=true. */
function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Togglely API')
    .setDescription(`Feature Flag Management API

## Authentication
1. Login with POST /api/auth/login (email + password)
2. Copy the token from the response
3. Click "Authorize" button and enter: Bearer {token}

## SDK Endpoints
Public SDK endpoints are available at /sdk/flags/ without authentication`)
    .setVersion('2.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)

  // Manually add endpoints to Swagger
  document.paths['/api/auth/login'] = {
    post: {
      tags: ['Auth'],
      summary: 'Login with email and password',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string', example: 'user@example.com' },
                password: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Returns JWT token' },
        '401': { description: 'Invalid credentials' },
      },
    },
  }

  document.paths['/sdk/flags/{projectKey}/{environmentKey}'] = {
    get: {
      tags: ['SDK'],
      summary: 'Get all flags for project/environment',
      parameters: [
        {
          name: 'projectKey',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'environmentKey',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'tenantId',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'brandKey',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'apiKey',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': { description: 'Returns all flags' },
        '404': { description: 'Not found' },
      },
    },
  }

  document.paths['/sdk/flags/{projectKey}/{environmentKey}/{flagKey}'] = {
    get: {
      tags: ['SDK'],
      summary: 'Get single flag value',
      parameters: [
        {
          name: 'projectKey',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'environmentKey',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'flagKey',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'tenantId',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'brandKey',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'apiKey',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': { description: 'Returns flag value' },
        '404': { description: 'Not found' },
      },
    },
  }

  SwaggerModule.setup('api/swagger', app, document, {
    customSiteTitle: 'Togglely API Docs',

    swaggerOptions: {
      url: '/api/swagger-json', // wichtig!
    },

    customCssUrl:
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css',

    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js',
    ],

    // 🔥 verhindert lokale swagger-ui-init.js Nutzung
    customJsStr: `
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: "/api/swagger-json",
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout"
      });
      window.ui = ui;
    };
  `,
  })
}

bootstrap()
