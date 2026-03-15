import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { getApiKeys, getMyApiKeys, createApiKey, revokeApiKey } from '../../controllers/apiKeys';
import { mockPrisma } from '../mocks/prisma.mock';
import * as jwtUtils from '../../utils/jwt';

jest.mock('../../utils/jwt', () => ({
  generateApiKey: jest.fn(),
}));

describe('API Keys Controller', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      user: { userId: 'user12345678901234567890', email: 'test@example.com' },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('getApiKeys', () => {
    it('should return all API keys for an organization', async () => {
      mockReq.params = { orgId: 'org123' };

      const mockKeys = [
        {
          id: 'key123',
          name: 'Production Key',
          type: 'SERVER',
          key: 'togglely_abc123def456',
          isActive: true,
          lastUsedAt: new Date(),
          expiresAt: null,
          user: { id: 'user123', email: 'test@example.com', firstName: 'Test', lastName: 'User' },
          createdAt: new Date(),
        },
      ];

      mockPrisma.apiKey.findMany.mockResolvedValue(mockKeys);

      await getApiKeys(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          id: 'key123',
          name: 'Production Key',
          key: expect.stringContaining('...'),
        }),
      ]));
    });
  });

  describe('getMyApiKeys', () => {
    it('should return all API keys for the current user', async () => {
      const mockKeys = [
        {
          id: 'key123',
          name: 'My Key',
          type: 'SERVER',
          key: 'togglely_abc123def456',
          organization: { id: 'org123', name: 'Test Org' },
          isActive: true,
          lastUsedAt: new Date(),
          expiresAt: null,
          createdAt: new Date(),
        },
      ];

      mockPrisma.apiKey.findMany.mockResolvedValue(mockKeys);

      await getMyApiKeys(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          id: 'key123',
          name: 'My Key',
          organization: expect.any(Object),
        }),
      ]));
    });
  });

  describe('createApiKey', () => {
    it('should create API key without expiration', async () => {
      mockReq.params = { orgId: 'org123' };
      mockReq.body = { name: 'New Key', type: 'SERVER' };

      const mockKey = {
        id: 'key123',
        name: 'New Key',
        type: 'SERVER',
        key: 'togglely_newkey123',
        expiresAt: null,
        createdAt: new Date(),
      };

      (jwtUtils.generateApiKey as jest.Mock).mockReturnValue('togglely_newkey123');
      mockPrisma.apiKey.create.mockResolvedValue(mockKey);

      await createApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        id: 'key123',
        name: 'New Key',
        key: 'togglely_newkey123',
      }));
    });

    it('should create API key with expiration', async () => {
      mockReq.params = { orgId: 'org123' };
      mockReq.body = { name: 'Temp Key', type: 'CLIENT', expiresInDays: 30 };

      const mockKey = {
        id: 'key123',
        name: 'Temp Key',
        type: 'CLIENT',
        key: 'togglely_tempkey123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      (jwtUtils.generateApiKey as jest.Mock).mockReturnValue('togglely_tempkey123');
      mockPrisma.apiKey.create.mockResolvedValue(mockKey);

      await createApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockPrisma.apiKey.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: expect.any(Date),
        }),
      }));
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke API key successfully', async () => {
      mockReq.params = { keyId: 'key123' };

      mockPrisma.apiKey.findFirst.mockResolvedValue({ id: 'key123' });
      mockPrisma.apiKey.update.mockResolvedValue({ id: 'key123', isActive: false });

      await revokeApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key123' },
        data: { isActive: false },
      });
    });

    it('should return 404 if API key not found', async () => {
      mockReq.params = { keyId: 'key123' };

      mockPrisma.apiKey.findFirst.mockResolvedValue(null);

      await revokeApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'API key not found' });
    });
  });
});
