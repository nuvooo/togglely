import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import morgan from 'morgan';
import { AppModule } from './app.module';

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
  
  app.setGlobalPrefix('api', { exclude: ['sdk', 'health'] });
  
  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Togglely API running on http://0.0.0.0:${port}`);
}
bootstrap();
