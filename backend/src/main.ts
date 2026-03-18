import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SdkService } from './modules/sdk/sdk.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Swagger UI needs relaxed CSP (inline scripts) — apply BEFORE helmet
  app.use((req: any, res: any, next: any) => {
    if (req.path && req.path.startsWith('/api/swagger')) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; style-src * 'unsafe-inline'; img-src * data:; script-src * 'unsafe-inline'; connect-src *; font-src * data:"
      );
      return next();
    }
    return helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })(req, res, next);
  });
  
  // CORS for all routes including SDK
  // Allow multiple origins via CORS_ORIGINS env variable
  const corsOriginsEnv = process.env.CORS_ORIGINS || '';
  const corsOrigins = corsOriginsEnv
    ? corsOriginsEnv.split(',').map(o => o.trim()).filter(o => o)
    : [];
  
  console.log('[CORS] Configuration:');
  console.log(`[CORS] CORS_ORIGINS env: "${corsOriginsEnv}"`);
  console.log(`[CORS] Parsed origins:`, corsOrigins.length > 0 ? corsOrigins : 'ALLOWING ALL (*)');
  
  // Check if we should allow all origins
  const allowAll = corsOrigins.length === 0 || corsOrigins.includes('*');
  
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-side, etc.)
      if (!origin) {
        console.log(`[CORS] Allowing request with no origin (curl/mobile)`);
        return callback(null, true);
      }
      
      // If CORS_ORIGINS is empty or contains *, allow all
      if (allowAll) {
        console.log(`[CORS] Allowing origin: ${origin} (wildcard mode)`);
        return callback(null, true);
      }
      
      // Always allow localhost origins for development
      if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
        console.log(`[CORS] Allowing localhost origin: ${origin}`);
        return callback(null, true);
      }
      
      // Check against allowed origins list
      const allowed = corsOrigins.some(allowed => {
        if (allowed === origin) return true;
        // Wildcard support: *.example.com
        if (allowed.startsWith('*.')) {
          const domain = allowed.slice(2);
          return origin.endsWith(domain);
        }
        return false;
      });
      
      if (allowed) {
        console.log(`[CORS] Allowing origin: ${origin}`);
        callback(null, true);
      } else {
        console.warn(`[CORS] BLOCKED origin: ${origin}`);
        console.warn(`[CORS] Allowed origins:`, corsOrigins);
        callback(new Error(`Origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
  }));
  
  app.use(morgan('combined'));
  
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  
  // Register standalone routes BEFORE global prefix
  const httpAdapter = app.getHttpAdapter();
  const sdkService = app.get(SdkService);
  
  // Health endpoint
  httpAdapter.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // SDK OPTIONS endpoints for CORS preflight
  httpAdapter.options('/sdk/flags/:projectKey/:environmentKey', (req, res) => {
    const origin = req.headers['origin'] as string | undefined;
    setSdkCorsHeaders(res, origin);
    res.status(200).send();
  });
  httpAdapter.options('/sdk/flags/:projectKey/:environmentKey/:flagKey', (req, res) => {
    const origin = req.headers['origin'] as string | undefined;
    setSdkCorsHeaders(res, origin);
    res.status(200).send();
  });
  
  // SDK endpoints with DEBUG logging
  
  // Helper function to set CORS headers for SDK responses
  const setSdkCorsHeaders = (res: any, origin?: string) => {
    const allowedOrigin = origin || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  };
  
  // Get single flag - MUST be registered BEFORE the list endpoint!
  httpAdapter.get('/sdk/flags/:projectKey/:environmentKey/:flagKey', async (req, res) => {
    const { projectKey, environmentKey, flagKey } = req.params;
    const { brandKey, tenantId, apiKey: queryApiKey } = req.query;
    const effectiveBrandKey = brandKey || tenantId;
    
    // Accept apiKey from query param OR Authorization: Bearer header OR X-API-Key header
    const authHeader = req.headers['authorization'] as string | undefined;
    const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const headerApiKey = req.headers['x-api-key'] as string | undefined;
    const apiKey = (queryApiKey as string | undefined) || bearerKey || headerApiKey;
    const origin = req.headers['origin'] as string | undefined;
    
    // Always set CORS headers first
    setSdkCorsHeaders(res, origin);
    
    console.log(`[SDK] Request: /sdk/flags/${projectKey}/${environmentKey}/${flagKey}`);
    console.log(`[SDK] API Key present: ${!!apiKey}, Origin: ${origin || 'none'}`);
    
    try {
      if (!apiKey) {
        console.log('[SDK] ERROR: No API key provided');
        return res.status(401).json({ error: 'API key required', code: 'MISSING_API_KEY' });
      }
      
      const result = await sdkService.evaluateFlag(
        projectKey,
        environmentKey,
        flagKey,
        apiKey,
        effectiveBrandKey as string,
        origin,
      );
      
      console.log(`[SDK] Success: ${flagKey} =`, result);
      res.json(result);
    } catch (error: any) {
      console.error(`[SDK] Error for ${flagKey}:`, error.message);
      
      if (error.status === 401 || error.message?.includes('Invalid API key')) {
        return res.status(401).json({ error: error.message || 'Invalid API key', code: 'INVALID_API_KEY' });
      }
      if (error.status === 403 || error.message?.includes('Origin not allowed')) {
        return res.status(403).json({ error: error.message || 'Origin not allowed', code: 'ORIGIN_NOT_ALLOWED' });
      }
      if (error.message?.includes('Project not found')) {
        return res.status(404).json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      }
      if (error.message?.includes('Environment not found')) {
        return res.status(404).json({ error: 'Environment not found', code: 'ENV_NOT_FOUND' });
      }
      res.status(500).json({ error: error.message || 'Internal error', code: 'INTERNAL_ERROR' });
    }
  });
  
  // Get all flags for project/environment
  httpAdapter.get('/sdk/flags/:projectKey/:environmentKey', async (req, res) => {
    const { projectKey, environmentKey } = req.params;
    const { brandKey, tenantId, apiKey: queryApiKey } = req.query;
    const effectiveBrandKey = brandKey || tenantId;
    
    // Accept apiKey from query param OR Authorization: Bearer header OR X-API-Key header
    const authHeader = req.headers['authorization'] as string | undefined;
    const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const headerApiKey = req.headers['x-api-key'] as string | undefined;
    const apiKey = (queryApiKey as string | undefined) || bearerKey || headerApiKey;
    const origin = req.headers['origin'] as string | undefined;
    
    // Always set CORS headers first
    setSdkCorsHeaders(res, origin);
    
    console.log(`[SDK] Request: /sdk/flags/${projectKey}/${environmentKey}`);
    console.log(`[SDK] API Key present: ${!!apiKey}, Origin: ${origin || 'none'}`);
    
    try {
      if (!apiKey) {
        console.log('[SDK] ERROR: No API key provided');
        return res.status(401).json({ error: 'API key required', code: 'MISSING_API_KEY' });
      }
      
      const results = await sdkService.getAllFlags(
        projectKey,
        environmentKey,
        apiKey,
        effectiveBrandKey as string,
        origin,
      );
      
      console.log(`[SDK] Success: ${Object.keys(results).length} flags returned`);
      res.json(results);
    } catch (error: any) {
      console.error(`[SDK] Error:`, error.message);
      
      if (error.status === 401 || error.message?.includes('Invalid API key')) {
        return res.status(401).json({ error: error.message || 'Invalid API key', code: 'INVALID_API_KEY' });
      }
      if (error.status === 403 || error.message?.includes('Origin not allowed')) {
        return res.status(403).json({ error: error.message || 'Origin not allowed', code: 'ORIGIN_NOT_ALLOWED' });
      }
      if (error.message?.includes('Project not found')) {
        return res.status(404).json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      }
      if (error.message?.includes('Environment not found')) {
        return res.status(404).json({ error: 'Environment not found', code: 'ENV_NOT_FOUND' });
      }
      res.status(500).json({ error: error.message || 'Internal error', code: 'INTERNAL_ERROR' });
    }
  });
  
  // Set global prefix BEFORE creating Swagger document so paths are correct
  app.setGlobalPrefix('api');
  
  // Swagger/OpenAPI Documentation - setup BEFORE global prefix
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
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  
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
                email: { type: 'string', example: 'demo@togglely.io' },
                password: { type: 'string', example: 'demo1234!' },
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
  };
  
  document.paths['/sdk/flags/{projectKey}/{environmentKey}'] = {
    get: {
      tags: ['SDK'],
      summary: 'Get all flags for project/environment',
      parameters: [
        { name: 'projectKey', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'environmentKey', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'tenantId', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'brandKey', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'apiKey', in: 'query', required: false, schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Returns all flags' },
        '404': { description: 'Not found' },
      },
    },
  };
  
  document.paths['/sdk/flags/{projectKey}/{environmentKey}/{flagKey}'] = {
    get: {
      tags: ['SDK'],
      summary: 'Get single flag value',
      parameters: [
        { name: 'projectKey', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'environmentKey', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'flagKey', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'tenantId', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'brandKey', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'apiKey', in: 'query', required: false, schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Returns flag value' },
        '404': { description: 'Not found' },
      },
    },
  };
  
  // Setup Swagger at /api/swagger — use CDN assets to avoid local static file path issues
  SwaggerModule.setup('api/swagger', app, document, {
    customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css',
    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js',
    ],
  });
  
  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Togglely API running on http://0.0.0.0:${port}`);
}
bootstrap();
