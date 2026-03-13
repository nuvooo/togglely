import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import {
  getMyProjects,
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from '../../controllers/projects';
import { mockPrisma } from '../mocks/prisma.mock';
import { createAuditLog } from '../../services/auditLog';

jest.mock('../../services/auditLog', () => ({
  createAuditLog: jest.fn(),
}));

describe('Projects Controller', () => {
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

  describe('getMyProjects', () => {
    it('should return all projects for the user across organizations', async () => {
      const mockMemberships = [
        { organizationId: 'org123' },
        { organizationId: 'org456' },
      ];

      const mockProjects = [
        {
          id: 'proj123',
          name: 'Project 1',
          key: 'project-1',
          description: 'Test project 1',
          organizationId: 'org123',
          organization: { name: 'Org 1' },
          createdAt: new Date(),
          _count: { featureFlags: 5, environments: 3 },
        },
        {
          id: 'proj456',
          name: 'Project 2',
          key: 'project-2',
          description: 'Test project 2',
          organizationId: 'org456',
          organization: { name: 'Org 2' },
          createdAt: new Date(),
          _count: { featureFlags: 2, environments: 2 },
        },
      ];

      mockPrisma.organizationMember.findMany.mockResolvedValue(mockMemberships);
      mockPrisma.project.findMany.mockResolvedValue(mockProjects);

      await getMyProjects(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          id: 'proj123',
          name: 'Project 1',
          flagCount: 5,
          environmentCount: 3,
          organizationName: 'Org 1',
        }),
        expect.objectContaining({
          id: 'proj456',
          name: 'Project 2',
          flagCount: 2,
          environmentCount: 2,
          organizationName: 'Org 2',
        }),
      ]));
    });

    it('should return empty array if user has no projects', async () => {
      mockPrisma.organizationMember.findMany.mockResolvedValue([]);
      mockPrisma.project.findMany.mockResolvedValue([]);

      await getMyProjects(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith([]);
    });
  });

  describe('getProjects', () => {
    it('should return all projects for an organization', async () => {
      mockReq.params = { orgId: 'org123' };

      const mockProjects = [
        {
          id: 'proj123',
          name: 'Project 1',
          key: 'project-1',
          description: 'Test project',
          createdAt: new Date(),
          _count: { featureFlags: 5, environments: 3 },
        },
      ];

      mockPrisma.project.findMany.mockResolvedValue(mockProjects);

      await getProjects(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          id: 'proj123',
          name: 'Project 1',
          flagCount: 5,
          environmentCount: 3,
        }),
      ]));
    });
  });

  describe('getProject', () => {
    it('should return project by id', async () => {
      mockReq.params = { projectId: 'proj123456789012345678901' };

      const mockProject = {
        id: 'proj123456789012345678901',
        name: 'Test Project',
        key: 'test-project',
        description: 'Test description',
        organizationId: 'org123',
        organization: { name: 'Test Org' },
        createdAt: new Date(),
        updatedAt: new Date(),
        environments: [
          { id: 'env1', name: 'Development', key: 'development' },
        ],
        _count: { featureFlags: 5 },
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);

      await getProject(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        id: 'proj123456789012345678901',
        name: 'Test Project',
        flagCount: 5,
        environments: expect.any(Array),
      }));
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { projectId: 'invalid-id' };

      await getProject(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid Project ID format' });
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { projectId: 'proj123456789012345678901' };
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await getProject(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });
  });

  describe('createProject', () => {
    it('should create project with default environments', async () => {
      mockReq.params = { orgId: 'org123' };
      mockReq.body = { name: 'New Project', key: 'new-project', description: 'Test' };

      const mockProject = {
        id: 'proj123',
        name: 'New Project',
        key: 'new-project',
        description: 'Test',
        organizationId: 'org123',
      };

      mockPrisma.project.create.mockResolvedValue(mockProject);
      mockPrisma.environment.createMany.mockResolvedValue({ count: 3 });

      await createProject(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(mockProject);
      expect(mockPrisma.environment.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'Development', key: 'development' }),
          expect.objectContaining({ name: 'Staging', key: 'staging' }),
          expect.objectContaining({ name: 'Production', key: 'production' }),
        ]),
      });
      expect(createAuditLog).toHaveBeenCalled();
    });
  });

  describe('updateProject', () => {
    it('should update project successfully', async () => {
      mockReq.params = { projectId: 'proj123' };
      mockReq.body = { name: 'Updated Project', description: 'Updated description' };

      const existingProject = {
        id: 'proj123',
        name: 'Old Project',
        description: 'Old description',
        organizationId: 'org123',
      };

      const updatedProject = {
        id: 'proj123',
        name: 'Updated Project',
        description: 'Updated description',
        organizationId: 'org123',
      };

      mockPrisma.project.findUnique.mockResolvedValue(existingProject);
      mockPrisma.project.update.mockResolvedValue(updatedProject);

      await updateProject(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(updatedProject);
      expect(createAuditLog).toHaveBeenCalled();
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { projectId: 'proj123' };
      mockReq.body = { name: 'Updated Project' };

      mockPrisma.project.findUnique.mockResolvedValue(null);

      await updateProject(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });
  });

  describe('deleteProject', () => {
    it('should delete project successfully', async () => {
      mockReq.params = { projectId: 'proj123456789012345678901' };

      const mockProject = {
        id: 'proj123456789012345678901',
        name: 'Test Project',
        key: 'test-project',
        organizationId: 'org123',
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.project.delete.mockResolvedValue(mockProject);

      await deleteProject(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(createAuditLog).toHaveBeenCalled();
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { projectId: 'invalid-id' };

      await deleteProject(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { projectId: 'proj123456789012345678901' };

      mockPrisma.project.findUnique.mockResolvedValue(null);

      await deleteProject(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });
});
