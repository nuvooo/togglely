import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth';
import { passwordResetRouter } from './routes/passwordReset';
import { organizationsRouter } from './routes/organizations';
import { projectsRouter } from './routes/projects';
import { environmentsRouter } from './routes/environments';
import { brandsRouter } from './routes/brands';
import { featureFlagsRouter } from './routes/featureFlags';
import { sdkRouter } from './routes/sdk';
import { apiKeysRouter } from './routes/apiKeys';
import { auditLogsRouter } from './routes/auditLogs';
import { errorHandler } from './middleware/errorHandler';
import { initRedis } from './utils/redis';
import cron from 'node-cron';
import { resetDemoData } from './utils/demoReset';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize Redis
initRedis();

// Schedule demo data reset every 10 minutes (only if enabled)
if (process.env.ENABLE_DEMO_RESET === 'true') {
  console.log('🔄 Demo data reset enabled - scheduling every 10 minutes');
  cron.schedule('*/10 * * * *', async () => {
    await resetDemoData();
  });
  // Run once on startup
  resetDemoData();
}

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:5173', // Vite default dev port
      'http://localhost:3000',  // Standard frontend port
      'https://togglely.examplesart.de', // Production URL
      '*' // Allow all origins for SDK (temporary for testing)
    ];
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    // For SDK requests, allow any origin
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development' || !origin) {
      callback(null, true);
    } else {
      console.log(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// SDK rate limiting - higher limits
const sdkLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10000, // 10k requests per minute for SDK
  message: { error: 'Rate limit exceeded' }
});
app.use('/sdk/', sdkLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/password-reset', passwordResetRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/brands', brandsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/environments', environmentsRouter);
app.use('/api/feature-flags', featureFlagsRouter);
app.use('/api/api-keys', apiKeysRouter);
app.use('/api/audit-logs', auditLogsRouter);

// SDK routes (for client applications)
app.use('/sdk', sdkRouter);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Togglely API running on port ${PORT}`);
});
