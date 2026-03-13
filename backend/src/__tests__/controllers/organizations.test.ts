import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
} from '../../controllers/organizations';
import { mockPrisma } from '../mocks/prisma.mock';
import * as passwordUtils from '../../utils/password';

jest.mock('../../utils/password', () => ({
  hashPassword: jest.fn(),
}));

describe('Organizations Controller', () => {
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

  describe('getOrganizations', () => {
    it('should return all organizations for the user', async () => {
      const mockMemberships = [
        {
          organization: {
            id: 'org123',
            name: 'Test Org',
            slug: 'test-org',
            description: 'Test description',
            createdAt: new Date(),
            _count: { members: 5, projects: 3 },
          },
          role: 'OWNER',
        },
      ];

      mockPrisma.organizationMember.findMany.mockResolvedValue(mockMemberships);

      await getOrganizations(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          id: 'org123',
          name: 'Test Org',
          role: 'OWNER',
          memberCount: 5,
          projectCount: 3,
        }),
      ]));
    });

    it('should return empty array if user has no organizations', async () => {
      mockPrisma.organizationMember.findMany.mockResolvedValue([]);

      await getOrganizations(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith([]);
    });
  });

  describe('getOrganization', () => {
    it('should return organization by id', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012' };

      const mockOrg = {
        id: 'org1234567890123456789012',
        name: 'Test Org',
        slug: 'test-org',
        description: 'Test description',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { members: 5, projects: 3 },
      };

      mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);

      await getOrganization(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        id: 'org1234567890123456789012',
        name: 'Test Org',
        memberCount: 5,
        projectCount: 3,
      }));
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { orgId: 'invalid-id' };

      await getOrganization(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid Organization ID format' });
    });

    it('should return 404 if organization not found', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012' };
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await getOrganization(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Organization not found' });
    });
  });

  describe('createOrganization', () => {
    it('should create organization successfully', async () => {
      mockReq.body = { name: 'New Org', description: 'Test description' };

      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const mockOrg = {
        id: 'org123',
        name: 'New Org',
        slug: 'new-org',
        description: 'Test description',
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          organization: { create: jest.fn().mockResolvedValue(mockOrg) },
          organizationMember: { create: jest.fn() },
        });
      });

      await createOrganization(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should return 409 if organization name already exists', async () => {
      mockReq.body = { name: 'Existing Org' };

      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'existing123',
        slug: 'existing-org',
      });

      await createOrganization(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Organization with this name already exists' });
    });
  });

  describe('updateOrganization', () => {
    it('should update organization successfully', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012' };
      mockReq.body = { name: 'Updated Org', description: 'Updated description' };

      const mockOrg = {
        id: 'org1234567890123456789012',
        name: 'Updated Org',
        slug: 'updated-org',
        description: 'Updated description',
      };

      mockPrisma.organization.update.mockResolvedValue(mockOrg);

      await updateOrganization(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(mockOrg);
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { orgId: 'invalid-id' };

      await updateOrganization(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('deleteOrganization', () => {
    it('should delete organization successfully', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012' };

      mockPrisma.organization.delete.mockResolvedValue({});

      await deleteOrganization(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockPrisma.organization.delete).toHaveBeenCalledWith({
        where: { id: 'org1234567890123456789012' },
      });
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { orgId: 'invalid-id' };

      await deleteOrganization(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getMembers', () => {
    it('should return all members of organization', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012' };

      const mockMembers = [
        {
          id: 'member1',
          userId: 'user1',
          user: { id: 'user1', email: 'user1@example.com', firstName: 'User', lastName: 'One' },
          role: 'OWNER',
          createdAt: new Date(),
        },
      ];

      mockPrisma.organizationMember.findMany.mockResolvedValue(mockMembers);

      await getMembers(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          email: 'user1@example.com',
          role: 'OWNER',
        }),
      ]));
    });
  });

  describe('inviteMember', () => {
    it('should invite existing user successfully', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012' };
      mockReq.body = { email: 'newuser@example.com', role: 'MEMBER' };

      const mockUser = {
        id: 'newuser123',
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.organizationMember.findUnique.mockResolvedValue(null);
      mockPrisma.organizationMember.create.mockResolvedValue({
        id: 'member123',
        userId: mockUser.id,
        role: 'MEMBER',
        user: mockUser,
      });

      await inviteMember(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should create user and invite if user does not exist', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012' };
      mockReq.body = { email: 'newuser@example.com', role: 'MEMBER' };

      const mockUser = {
        id: 'newuser123',
        email: 'newuser@example.com',
        firstName: 'Invited',
        lastName: 'User',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      (passwordUtils.hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.organizationMember.findUnique.mockResolvedValue(null);
      mockPrisma.organizationMember.create.mockResolvedValue({
        id: 'member123',
        userId: mockUser.id,
        role: 'MEMBER',
        user: mockUser,
      });

      await inviteMember(mockReq, mockRes as Response, mockNext);

      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should return 409 if user is already a member', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012' };
      mockReq.body = { email: 'existing@example.com' };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user123' });
      mockPrisma.organizationMember.findUnique.mockResolvedValue({ id: 'member123' });

      await inviteMember(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User is already a member' });
    });
  });

  describe('updateMemberRole', () => {
    it('should update member role successfully', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012', userId: 'user12345678901234567890' };
      mockReq.body = { role: 'ADMIN' };

      const mockMember = {
        id: 'member123',
        userId: 'user12345678901234567890',
        organizationId: 'org1234567890123456789012',
        role: 'ADMIN',
      };

      mockPrisma.organizationMember.update.mockResolvedValue(mockMember);

      await updateMemberRole(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(mockMember);
    });

    it('should return 400 for invalid userId', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012', userId: 'invalid-id' };

      await updateMemberRole(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('removeMember', () => {
    it('should remove member successfully', async () => {
      mockReq.params = { orgId: 'org1234567890123456789012', userId: 'user12345678901234567890' };

      mockPrisma.organizationMember.delete.mockResolvedValue({});

      await removeMember(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(204);
    });

    it('should return 400 for invalid orgId', async () => {
      mockReq.params = { orgId: 'invalid-id', userId: 'user12345678901234567890' };

      await removeMember(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
