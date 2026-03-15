import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { authenticate, authenticateApiKey, requireOrgMember, requireOrgRole } from '../../middleware/auth';
import * as jwtUtils from '../../utils/jwt';
import { mockPrisma } from '../mocks/prisma.mock';

jest.mock('../../utils/jwt', () => ({
  verifyToken: jest.fn(),
}));

describe('Auth Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      params: {},
      user: undefined,
      organizationId: undefined,
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate user with valid token', async () => {
      const token = 'valid-token';
      mockReq.headers = { authorization: `Bearer ${token}` };

      const mockPayload = { userId: 'user123', email: 'test@example.com' };
      (jwtUtils.verifyToken as jest.Mock).mockReturnValue(mockPayload);

      await authenticate(mockReq, mockRes as Response, mockNext);

      expect(mockReq.user).toEqual({ ...mockPayload, id: 'user123' });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should return 401 if no authorization header', async () => {
      mockReq.headers = {};

      await authenticate(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if authorization header does not start with Bearer', async () => {
      mockReq.headers = { authorization: 'Basic dXNlcjpwYXNz' };

      await authenticate(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 if token is invalid', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };
      (jwtUtils.verifyToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticate(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });
  });

  describe('authenticateApiKey', () => {
    it('should authenticate with valid API key from header', async () => {
      const apiKey = 'togglely_validapikey123';
      mockReq.headers = { authorization: `Bearer ${apiKey}` };

      const mockKeyRecord = {
        id: 'key123',
        key: apiKey,
        isActive: true,
        expiresAt: null,
        organizationId: 'org123',
        organization: { id: 'org123', name: 'Test Org' },
      };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockKeyRecord);
      mockPrisma.apiKey.update.mockResolvedValue(mockKeyRecord);

      await authenticateApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockReq.organizationId).toBe('org123');
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key123' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('should authenticate with valid API key from query param', async () => {
      const apiKey = 'togglely_validapikey123';
      mockReq = { query: { apiKey }, headers: {} };

      const mockKeyRecord = {
        id: 'key123',
        key: apiKey,
        isActive: true,
        expiresAt: null,
        organizationId: 'org123',
      };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockKeyRecord);
      mockPrisma.apiKey.update.mockResolvedValue(mockKeyRecord);

      await authenticateApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockReq.organizationId).toBe('org123');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should authenticate with valid API key from x-api-key header', async () => {
      const apiKey = 'togglely_validapikey123';
      mockReq.headers = { 'x-api-key': apiKey };

      const mockKeyRecord = {
        id: 'key123',
        key: apiKey,
        isActive: true,
        expiresAt: null,
        organizationId: 'org123',
      };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockKeyRecord);
      mockPrisma.apiKey.update.mockResolvedValue(mockKeyRecord);

      await authenticateApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockReq.organizationId).toBe('org123');
    });

    it('should return 401 if no API key provided', async () => {
      mockReq.headers = {};

      await authenticateApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'API key required' });
    });

    it('should return 401 if API key not found', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-key' };
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);

      await authenticateApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
    });

    it('should return 401 if API key is inactive', async () => {
      mockReq.headers = { authorization: 'Bearer inactive-key' };
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: 'key123',
        key: 'inactive-key',
        isActive: false,
        organizationId: 'org123',
      });

      await authenticateApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 if API key is expired', async () => {
      mockReq.headers = { authorization: 'Bearer expired-key' };
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: 'key123',
        key: 'expired-key',
        isActive: true,
        expiresAt: new Date('2020-01-01'),
        organizationId: 'org123',
      });

      await authenticateApiKey(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'API key expired' });
    });
  });

  describe('requireOrgMember', () => {
    it('should allow access for organization member', async () => {
      mockReq = {
        params: { orgId: 'org123' },
        user: { userId: 'user123', email: 'test@example.com' },
      };

      mockPrisma.organizationMember.findUnique.mockResolvedValue({
        id: 'member123',
        userId: 'user123',
        organizationId: 'org123',
        role: 'MEMBER',
      });

      await requireOrgMember(mockReq, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should return 401 if user not authenticated', async () => {
      mockReq = {
        params: { orgId: 'org123' },
        user: undefined,
      };

      await requireOrgMember(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 403 if user is not a member', async () => {
      mockReq = {
        params: { orgId: 'org123' },
        user: { userId: 'user123', email: 'test@example.com' },
      };

      mockPrisma.organizationMember.findUnique.mockResolvedValue(null);

      await requireOrgMember(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not a member of this organization' });
    });
  });

  describe('requireOrgRole', () => {
    it('should allow access for user with required role', async () => {
      mockReq = {
        params: { orgId: 'org123' },
        user: { userId: 'user123', email: 'test@example.com' },
      };

      mockPrisma.organizationMember.findUnique.mockResolvedValue({
        id: 'member123',
        userId: 'user123',
        organizationId: 'org123',
        role: 'ADMIN',
      });

      const middleware = requireOrgRole(['ADMIN', 'OWNER']);
      await middleware(mockReq, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should return 403 for user without required role', async () => {
      mockReq = {
        params: { orgId: 'org123' },
        user: { userId: 'user123', email: 'test@example.com' },
      };

      mockPrisma.organizationMember.findUnique.mockResolvedValue({
        id: 'member123',
        userId: 'user123',
        organizationId: 'org123',
        role: 'MEMBER',
      });

      const middleware = requireOrgRole(['ADMIN', 'OWNER']);
      await middleware(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    });

    it('should return 401 if user not authenticated', async () => {
      mockReq = {
        params: { orgId: 'org123' },
        user: undefined,
      };

      const middleware = requireOrgRole(['ADMIN']);
      await middleware(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 if membership not found', async () => {
      mockReq = {
        params: { orgId: 'org123' },
        user: { userId: 'user123', email: 'test@example.com' },
      };

      mockPrisma.organizationMember.findUnique.mockResolvedValue(null);

      const middleware = requireOrgRole(['ADMIN']);
      await middleware(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});
