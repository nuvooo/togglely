import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import morgan from 'morgan';
import { AppModule } from './app.module';
import { SdkService } from './modules/sdk/sdk.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:5173',
      'https://togglely.examplesart.de'
    ],
    credentials: true,
  });
  
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
  httpAdapter.get('/sdk/flags/:projectKey/:environmentKey/:flagKey', async (req, res) => {
    try {
      const { projectKey, environmentKey, flagKey } = req.params;
      const { brandKey } = req.query;
      const result = await sdkService.evaluateFlag(
        projectKey,
        environmentKey,
        flagKey,
        brandKey as string,
      );
      res.json(result);
    } catch (error) {
      res.status(404).json({ error: 'Flag not found' });
    }
  });
  
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Togglely API running on http://0.0.0.0:${port}`);
}
bootstrap();
