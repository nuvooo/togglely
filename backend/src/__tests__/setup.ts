import { jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';

// Mock Redis
jest.mock('../utils/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  },
  invalidateFlagCache: jest.fn(),
  initRedis: jest.fn(),
}));

// Mock Audit Log Service
jest.mock('../services/auditLog', () => ({
  createAuditLog: jest.fn(),
}));
