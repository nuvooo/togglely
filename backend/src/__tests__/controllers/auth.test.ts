import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { register, login, getMe, updateProfile } from '../../controllers/auth';
import { mockPrisma } from '../mocks/prisma.mock';
import * as passwordUtils from '../../utils/password';
import * as jwtUtils from '../../utils/jwt';

// Mock password utilities
jest.mock('../../utils/password', () => ({
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));

// Mock JWT utilities
jest.mock('../../utils/jwt', () => ({
  generateToken: jest.fn(),
  verifyToken: jest.fn(),
}));

describe('Auth Controller', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      user: { userId: 'user123', email: 'test@example.com' },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('register', () => {
    const validRegisterData = {
      email: 'new@example.com',
      password: 'password123',
      firstName: 'New',
      lastName: 'User',
      organizationName: 'New Org',
    };

    it('should register a new user successfully', async () => {
      mockReq.body = validRegisterData;
      
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (passwordUtils.hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      (jwtUtils.generateToken as jest.Mock).mockReturnValue('mockToken');

      const mockUser = {
        id: 'user123',
        email: validRegisterData.email,
        firstName: validRegisterData.firstName,
        lastName: validRegisterData.lastName,
      };

      const mockOrg = {
        id: 'org123',
        name: validRegisterData.organizationName,
        slug: 'new-org',
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: jest.fn().mockResolvedValue(mockUser) },
          organization: { create: jest.fn().mockResolvedValue(mockOrg) },
          organizationMember: { create: jest.fn() },
          project: { create: jest.fn().mockResolvedValue({ id: 'proj123' }) },
          environment: { createMany: jest.fn() },
        });
      });

      await register(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Registration successful',
        token: 'mockToken',
        user: expect.objectContaining({
          email: validRegisterData.email,
        }),
      }));
    });

    it('should return 409 if email already exists', async () => {
      mockReq.body = validRegisterData;
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing123',
        email: validRegisterData.email,
      });

      await register(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Email already registered' });
    });

    it('should handle missing required fields', async () => {
      mockReq.body = { email: 'test@example.com' };

      await register(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should login successfully with valid credentials', async () => {
      mockReq.body = validLoginData;

      const mockUser = {
        id: 'user123',
        email: validLoginData.email,
        password: 'hashedPassword',
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (passwordUtils.comparePassword as jest.Mock).mockResolvedValue(true);
      (jwtUtils.generateToken as jest.Mock).mockReturnValue('mockToken');
      mockPrisma.organizationMember.findMany.mockResolvedValue([
        {
          organization: {
            id: 'org123',
            name: 'Test Org',
            slug: 'test-org',
          },
          role: 'OWNER',
        },
      ]);

      await login(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        token: 'mockToken',
        user: expect.objectContaining({
          email: validLoginData.email,
        }),
      }));
    });

    it('should return 401 for invalid email', async () => {
      mockReq.body = validLoginData;
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await login(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should return 401 for inactive user', async () => {
      mockReq.body = validLoginData;
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: validLoginData.email,
        isActive: false,
        password: 'hashedPassword',
      });

      await login(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should return 401 for invalid password', async () => {
      mockReq.body = validLoginData;
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: validLoginData.email,
        isActive: true,
        password: 'hashedPassword',
      });
      (passwordUtils.comparePassword as jest.Mock).mockResolvedValue(false);

      await login(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });
  });

  describe('getMe', () => {
    it('should return current user data', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        createdAt: new Date(),
        memberships: [
          {
            organization: {
              id: 'org123',
              name: 'Test Org',
              slug: 'test-org',
              description: 'Test',
            },
          },
        ],
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await getMe(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(mockUser);
    });

    it('should return 404 if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await getMe(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
    });
  });

  describe('updateProfile', () => {
    it('should update user profile successfully', async () => {
      mockReq.body = { firstName: 'Updated', lastName: 'Name' };

      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        firstName: 'Updated',
        lastName: 'Name',
        updatedAt: new Date(),
      };

      mockPrisma.user.update.mockResolvedValue(mockUser);

      await updateProfile(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(mockUser);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'user123' },
        data: { firstName: 'Updated', lastName: 'Name' },
      }));
    });

    it('should handle partial updates', async () => {
      mockReq.body = { firstName: 'OnlyFirst' };

      mockPrisma.user.update.mockResolvedValue({
        id: 'user123',
        firstName: 'OnlyFirst',
        lastName: 'User',
      });

      await updateProfile(mockReq, mockRes as Response, mockNext);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { firstName: 'OnlyFirst' },
      }));
    });
  });
});
