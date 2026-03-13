import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import {
  getMyFeatureFlags,
  getFeatureFlags,
  getFeatureFlag,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  toggleFlag,
  updateFlagValue,
  getFlagEnvironments,
  updateFlagEnvironment,
  createTargetingRule,
  updateTargetingRule,
  deleteTargetingRule,
} from '../../controllers/featureFlags';
import { mockPrisma } from '../mocks/prisma.mock';
import { createAuditLog } from '../../services/auditLog';
import { invalidateFlagCache } from '../../utils/redis';

jest.mock('../../services/auditLog', () => ({
  createAuditLog: jest.fn(),
}));

jest.mock('../../utils/redis', () => ({
  invalidateFlagCache: jest.fn(),
}));

describe('FeatureFlags Controller', () => {
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

  describe('getMyFeatureFlags', () => {
    it('should return all feature flags for the user', async () => {
      const mockMemberships = [{ organizationId: 'org123' }];

      const mockFlags = [
        {
          id: 'flag123',
          name: 'Test Feature',
          key: 'test-feature',
          description: 'Test description',
          flagType: 'BOOLEAN',
          projectId: 'proj123',
          project: { name: 'Test Project', id: 'proj123' },
          createdBy: { id: 'user123', firstName: 'Test', lastName: 'User' },
          flagEnvironments: [
            {
              id: 'fe1',
              environmentId: 'env1',
              environment: { name: 'Development', key: 'development' },
              enabled: true,
              defaultValue: 'true',
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.organizationMember.findMany.mockResolvedValue(mockMemberships);
      mockPrisma.featureFlag.findMany.mockResolvedValue(mockFlags);

      await getMyFeatureFlags(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          id: 'flag123',
          name: 'Test Feature',
          environments: expect.any(Array),
        }),
      ]));
    });
  });

  describe('getFeatureFlags', () => {
    it('should return all feature flags for a project', async () => {
      mockReq.params = { projectId: 'proj123' };

      const mockFlags = [
        {
          id: 'flag123',
          name: 'Test Feature',
          key: 'test-feature',
          description: 'Test description',
          flagType: 'BOOLEAN',
          createdBy: { id: 'user123', firstName: 'Test', lastName: 'User' },
          flagEnvironments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.featureFlag.findMany.mockResolvedValue(mockFlags);

      await getFeatureFlags(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.any(Array));
    });
  });

  describe('getFeatureFlag', () => {
    it('should return feature flag by id', async () => {
      mockReq.params = { flagId: 'flag123456789012345678901' };

      const mockFlag = {
        id: 'flag123456789012345678901',
        name: 'Test Feature',
        key: 'test-feature',
        description: 'Test description',
        flagType: 'BOOLEAN',
        projectId: 'proj123',
        createdBy: { id: 'user123', firstName: 'Test', lastName: 'User' },
        flagEnvironments: [
          {
            id: 'fe1',
            environmentId: 'env1',
            environment: { name: 'Development', key: 'development' },
            enabled: true,
            defaultValue: 'true',
            targetingRules: [],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFlag);

      await getFeatureFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        id: 'flag123456789012345678901',
        name: 'Test Feature',
      }));
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { flagId: 'invalid-id' };

      await getFeatureFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if flag not found', async () => {
      mockReq.params = { flagId: 'flag123456789012345678901' };
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      await getFeatureFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createFeatureFlag', () => {
    it('should create feature flag with environments', async () => {
      mockReq.params = { projectId: 'proj123' };
      mockReq.body = { name: 'New Feature', key: 'new-feature', description: 'Test', flagType: 'BOOLEAN' };

      const mockProject = {
        id: 'proj123',
        organizationId: 'org123',
        environments: [
          { id: 'env1', name: 'Development' },
          { id: 'env2', name: 'Production' },
        ],
      };

      const mockFlag = {
        id: 'flag123',
        name: 'New Feature',
        key: 'new-feature',
        description: 'Test',
        flagType: 'BOOLEAN',
        projectId: 'proj123',
        organizationId: 'org123',
        createdById: 'user12345678901234567890',
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      
      // Mock transaction to return the flag directly
      mockPrisma.$transaction.mockResolvedValue(mockFlag);

      await createFeatureFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { projectId: 'proj123' };
      mockReq.body = { name: 'New Feature', key: 'new-feature' };

      mockPrisma.project.findUnique.mockResolvedValue(null);

      await createFeatureFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateFeatureFlag', () => {
    it('should update feature flag successfully', async () => {
      mockReq.params = { flagId: 'flag123' };
      mockReq.body = { name: 'Updated Feature', description: 'Updated' };

      const existingFlag = {
        id: 'flag123',
        name: 'Old Feature',
        description: 'Old description',
        organizationId: 'org123',
        projectId: 'proj123',
      };

      const updatedFlag = {
        id: 'flag123',
        name: 'Updated Feature',
        description: 'Updated',
        organizationId: 'org123',
        projectId: 'proj123',
        updatedById: 'user12345678901234567890',
      };

      mockPrisma.featureFlag.findUnique.mockResolvedValue(existingFlag);
      mockPrisma.featureFlag.update.mockResolvedValue(updatedFlag);

      await updateFeatureFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(updatedFlag);
      expect(createAuditLog).toHaveBeenCalled();
    });

    it('should return 404 if flag not found', async () => {
      mockReq.params = { flagId: 'flag123' };
      mockReq.body = { name: 'Updated Feature' };

      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      await updateFeatureFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteFeatureFlag', () => {
    it('should delete feature flag and invalidate cache', async () => {
      mockReq.params = { flagId: 'flag123456789012345678901' };

      const mockFlag = {
        id: 'flag123456789012345678901',
        name: 'Test Feature',
        key: 'test-feature',
        organizationId: 'org123',
        projectId: 'proj123',
        flagEnvironments: [
          { environmentId: 'env1' },
          { environmentId: 'env2' },
        ],
      };

      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFlag);
      mockPrisma.featureFlag.delete.mockResolvedValue(mockFlag);

      await deleteFeatureFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(invalidateFlagCache).toHaveBeenCalledTimes(2);
      expect(createAuditLog).toHaveBeenCalled();
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { flagId: 'invalid-id' };

      await deleteFeatureFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('toggleFlag', () => {
    it('should toggle flag status and invalidate cache', async () => {
      mockReq.params = { flagId: 'flag123' };
      mockReq.body = { environmentId: 'env123', enabled: true };

      const mockFlagEnv = {
        id: 'fe123',
        flagId: 'flag123',
        environmentId: 'env123',
        enabled: false,
        flag: { key: 'test-feature', organizationId: 'org123', projectId: 'proj123' },
        environment: { id: 'env123' },
      };

      mockPrisma.flagEnvironment.findUnique.mockResolvedValue(mockFlagEnv);
      mockPrisma.flagEnvironment.update.mockResolvedValue({ ...mockFlagEnv, enabled: true });

      await toggleFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
      expect(invalidateFlagCache).toHaveBeenCalled();
      expect(createAuditLog).toHaveBeenCalled();
    });

    it('should return 404 if flag environment not found', async () => {
      mockReq.params = { flagId: 'flag123' };
      mockReq.body = { environmentId: 'env123', enabled: true };

      mockPrisma.flagEnvironment.findUnique.mockResolvedValue(null);

      await toggleFlag(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateFlagValue', () => {
    it('should update flag default value', async () => {
      mockReq.params = { flagId: 'flag123' };
      mockReq.body = { environmentId: 'env123', defaultValue: 'new-value' };

      const mockFlagEnv = {
        id: 'fe123',
        flagId: 'flag123',
        environmentId: 'env123',
        defaultValue: 'old-value',
        flag: { key: 'test-feature', organizationId: 'org123', projectId: 'proj123' },
      };

      mockPrisma.flagEnvironment.findUnique.mockResolvedValue(mockFlagEnv);
      mockPrisma.flagEnvironment.update.mockResolvedValue({ ...mockFlagEnv, defaultValue: 'new-value' });

      await updateFlagValue(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: 'new-value' }));
      expect(createAuditLog).toHaveBeenCalled();
    });
  });

  describe('getFlagEnvironments', () => {
    it('should return all flag environments', async () => {
      mockReq.params = { flagId: 'flag123456789012345678901' };

      const mockFlagEnvs = [
        {
          id: 'fe1',
          flagId: 'flag123456789012345678901',
          environmentId: 'env1',
          environment: { id: 'env1', name: 'Development', key: 'development' },
          enabled: true,
          defaultValue: 'true',
          targetingRules: [],
        },
      ];

      mockPrisma.flagEnvironment.findMany.mockResolvedValue(mockFlagEnvs);

      await getFlagEnvironments(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(mockFlagEnvs);
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { flagId: 'invalid-id' };

      await getFlagEnvironments(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updateFlagEnvironment', () => {
    it('should update flag environment', async () => {
      mockReq.params = { flagId: 'flag123', environmentId: 'env123' };
      mockReq.body = { enabled: false, defaultValue: 'false' };

      const mockFlagEnv = {
        id: 'fe123',
        flagId: 'flag123',
        environmentId: 'env123',
        enabled: true,
        defaultValue: 'true',
        flag: { key: 'test-feature' },
      };

      mockPrisma.flagEnvironment.findUnique.mockResolvedValue(mockFlagEnv);
      mockPrisma.flagEnvironment.update.mockResolvedValue({ ...mockFlagEnv, enabled: false, defaultValue: 'false' });

      await updateFlagEnvironment(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });
  });

  describe('createTargetingRule', () => {
    it('should create targeting rule with conditions', async () => {
      mockReq.params = { flagId: 'flag123456789012345678901', environmentId: 'env123456789012345678901' };
      mockReq.body = {
        name: 'Test Rule',
        operator: 'AND',
        serveValue: 'true',
        conditions: [{ attribute: 'userId', operator: 'equals', value: '123' }],
        priority: 1,
      };

      const mockFlagEnv = { id: 'fe123', flagId: 'flag123456789012345678901', environmentId: 'env123456789012345678901' };

      const mockRule = {
        id: 'rule123',
        flagEnvId: 'fe123',
        name: 'Test Rule',
        operator: 'AND',
        serveValue: 'true',
        priority: 1,
        conditions: [{ id: 'cond1', attribute: 'userId', operator: 'equals', value: '123' }],
      };

      mockPrisma.flagEnvironment.findUnique.mockResolvedValue(mockFlagEnv);
      mockPrisma.targetingRule.create.mockResolvedValue(mockRule);

      await createTargetingRule(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(mockRule);
    });
  });

  describe('updateTargetingRule', () => {
    it('should update targeting rule and replace conditions', async () => {
      mockReq.params = { ruleId: 'rule1234567890123456789012' };
      mockReq.body = {
        name: 'Updated Rule',
        operator: 'OR',
        serveValue: 'false',
        conditions: [{ attribute: 'country', operator: 'equals', value: 'DE' }],
      };

      const mockRule = {
        id: 'rule1234567890123456789012',
        name: 'Updated Rule',
        operator: 'OR',
        serveValue: 'false',
        conditions: [{ id: 'cond2', attribute: 'country', operator: 'equals', value: 'DE' }],
      };

      mockPrisma.$transaction.mockResolvedValue(mockRule);

      await updateTargetingRule(mockReq, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { ruleId: 'invalid-id' };

      await updateTargetingRule(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('deleteTargetingRule', () => {
    it('should delete targeting rule', async () => {
      mockReq.params = { ruleId: 'rule1234567890123456789012' };

      mockPrisma.targetingRule.delete.mockResolvedValue({});

      await deleteTargetingRule(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(204);
    });

    it('should return 400 for invalid ObjectId', async () => {
      mockReq.params = { ruleId: 'invalid-id' };

      await deleteTargetingRule(mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
