import { jest } from '@jest/globals';

// Type definitions for mock returns
type MockReturnValue = any;

// Create a mock Prisma client with proper typing
export const mockPrisma = {
  user: {
    findUnique: jest.fn<() => Promise<MockReturnValue>>(),
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    update: jest.fn<() => Promise<MockReturnValue>>(),
    delete: jest.fn<() => Promise<MockReturnValue>>(),
  },
  organization: {
    findUnique: jest.fn<() => Promise<MockReturnValue>>(),
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    update: jest.fn<() => Promise<MockReturnValue>>(),
    delete: jest.fn<() => Promise<MockReturnValue>>(),
  },
  organizationMember: {
    findUnique: jest.fn<() => Promise<MockReturnValue>>(),
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    update: jest.fn<() => Promise<MockReturnValue>>(),
    delete: jest.fn<() => Promise<MockReturnValue>>(),
  },
  project: {
    findUnique: jest.fn<() => Promise<MockReturnValue>>(),
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    update: jest.fn<() => Promise<MockReturnValue>>(),
    delete: jest.fn<() => Promise<MockReturnValue>>(),
  },
  environment: {
    findUnique: jest.fn<() => Promise<MockReturnValue>>(),
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    createMany: jest.fn<() => Promise<{ count: number }>>(),
    update: jest.fn<() => Promise<MockReturnValue>>(),
    delete: jest.fn<() => Promise<MockReturnValue>>(),
  },
  featureFlag: {
    findUnique: jest.fn<() => Promise<MockReturnValue>>(),
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    update: jest.fn<() => Promise<MockReturnValue>>(),
    delete: jest.fn<() => Promise<MockReturnValue>>(),
  },
  flagEnvironment: {
    findUnique: jest.fn<() => Promise<MockReturnValue>>(),
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    createMany: jest.fn<() => Promise<{ count: number }>>(),
    update: jest.fn<() => Promise<MockReturnValue>>(),
    delete: jest.fn<() => Promise<MockReturnValue>>(),
  },
  targetingRule: {
    findUnique: jest.fn<() => Promise<MockReturnValue>>(),
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    update: jest.fn<() => Promise<MockReturnValue>>(),
    delete: jest.fn<() => Promise<MockReturnValue>>(),
  },
  ruleCondition: {
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    createMany: jest.fn<() => Promise<{ count: number }>>(),
    deleteMany: jest.fn<() => Promise<{ count: number }>>(),
  },
  apiKey: {
    findUnique: jest.fn<() => Promise<MockReturnValue>>(),
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
    update: jest.fn<() => Promise<MockReturnValue>>(),
    delete: jest.fn<() => Promise<MockReturnValue>>(),
  },
  auditLog: {
    findMany: jest.fn<() => Promise<MockReturnValue[]>>(),
    create: jest.fn<() => Promise<MockReturnValue>>(),
  },
  $transaction: jest.fn<() => Promise<MockReturnValue>>(),
};

// Mock the prisma module
jest.mock('../../utils/prisma', () => ({
  prisma: mockPrisma,
}));

export default mockPrisma;
