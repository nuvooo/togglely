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
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:"
      );
      return next();
    }
    return helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })(req, res, next);
  });
  
  // CORS for all routes including SDK
  app.use(cors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:5173',
      'https://togglely.de'
    ],
    credentials: true,
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
  
  // SDK endpoints
  
  // Get single flag - MUST be registered BEFORE the list endpoint!
  httpAdapter.get('/sdk/flags/:projectKey/:environmentKey/:flagKey', async (req, res) => {
    try {
      const { projectKey, environmentKey, flagKey } = req.params;
      const { brandKey, tenantId, apiKey: queryApiKey } = req.query;
      const effectiveBrandKey = brandKey || tenantId;
      
      // Accept apiKey from query param OR Authorization: Bearer header
      const authHeader = req.headers['authorization'] as string | undefined;
      const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const apiKey = (queryApiKey as string | undefined) || bearerKey;
      
      if (apiKey) {
        const validKey = await sdkService.validateApiKey(apiKey, projectKey);
        if (!validKey) {
          return res.status(401).json({ error: 'Invalid API key' });
        }
      }
      
      const result = await sdkService.evaluateFlag(
        projectKey,
        environmentKey,
        flagKey,
        effectiveBrandKey as string,
      );
      res.json(result);
    } catch (error) {
      res.status(404).json({ error: 'Flag not found' });
    }
  });
  
  // Get all flags for project/environment
  httpAdapter.get('/sdk/flags/:projectKey/:environmentKey', async (req, res) => {
    try {
      const { projectKey, environmentKey } = req.params;
      const { brandKey, tenantId, apiKey: queryApiKey } = req.query;
      const effectiveBrandKey = brandKey || tenantId;
      
      // Accept apiKey from query param OR Authorization: Bearer header
      const authHeader = req.headers['authorization'] as string | undefined;
      const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const apiKey = (queryApiKey as string | undefined) || bearerKey;
      
      if (apiKey) {
        const validKey = await sdkService.validateApiKey(apiKey, projectKey);
        if (!validKey) {
          return res.status(401).json({ error: 'Invalid API key' });
        }
      }
      
      const results = await sdkService.evaluateAllFlags(
        projectKey,
        environmentKey,
        effectiveBrandKey as string,
      );
      res.json(results);
    } catch (error) {
      res.status(404).json({ error: 'Project or environment not found' });
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
  
  // Setup Swagger at /api/swagger
  SwaggerModule.setup('api/swagger', app, document);
  
  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Togglely API running on http://0.0.0.0:${port}`);
}
bootstrap();
