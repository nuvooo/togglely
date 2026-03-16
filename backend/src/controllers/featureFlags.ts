import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { createAuditLog } from '../services/auditLog';
import { invalidateFlagCache } from '../utils/redis';

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

const sendInvalidIdError = (res: Response, fieldName: string = 'ID') => {
  res.status(400).json({ error: `Invalid ${fieldName} format` });
};

// Get all feature flags for the current user across all projects
export const getMyFeatureFlags = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    // Get all organizations the user is a member of
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true }
    });

    const orgIds = memberships.map(m => m.organizationId);

    const flags = await prisma.featureFlag.findMany({
      where: { organizationId: { in: orgIds } },
      include: {
        project: {
          select: { name: true, id: true }
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true }
        },
        flagEnvironments: {
          include: {
            environment: {
              select: { id: true, name: true, key: true }
            }
          }
        }
      }
    });

    res.json(flags.map(f => ({
      id: f.id,
      name: f.name,
      key: f.key,
      description: f.description,
      flagType: f.flagType,
      projectId: f.projectId,
      projectName: f.project.name,
      createdBy: f.createdBy,
      environments: f.flagEnvironments.map(fe => ({
        id: fe.id,
        environmentId: fe.environmentId,
        environmentName: fe.environment.name,
        environmentKey: fe.environment.key,
        enabled: fe.enabled,
        defaultValue: fe.defaultValue
      })),
      createdAt: f.createdAt,
      updatedAt: f.updatedAt
    })));
  } catch (error) {
    next(error);
  }
};

export const getFeatureFlags = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    const flags = await prisma.featureFlag.findMany({
      where: { projectId },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        flagEnvironments: {
          include: {
            environment: {
              select: {
                id: true,
                name: true,
                key: true,
                sortOrder: true
              }
            }
          }
        }
      }
    });

    res.json(flags.map(f => ({
      id: f.id,
      name: f.name,
      key: f.key,
      description: f.description,
      flagType: f.flagType,
      createdBy: f.createdBy,
      environments: f.flagEnvironments
        .sort((a, b) => (a.environment.sortOrder || 0) - (b.environment.sortOrder || 0))
        .map(fe => ({
          id: fe.id,
          environmentId: fe.environmentId,
          environmentName: fe.environment.name,
          environmentKey: fe.environment.key,
          enabled: fe.enabled,
          defaultValue: fe.defaultValue
        })),
      createdAt: f.createdAt,
      updatedAt: f.updatedAt
    })));
  } catch (error) {
    next(error);
  }
};

export const getFeatureFlag = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { flagId } = req.params;

    if (!isValidObjectId(flagId)) {
      return sendInvalidIdError(res, 'Flag ID');
    }

    const flag = await prisma.featureFlag.findUnique({
      where: { id: flagId },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        flagEnvironments: {
          include: {
            environment: {
              select: {
                id: true,
                name: true,
                key: true,
                sortOrder: true
              }
            },
            targetingRules: {
              include: {
                conditions: true
              },
              orderBy: {
                priority: 'asc'
              }
            }
          }
        }
      }
    });

    if (!flag) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }

    res.json({
      id: flag.id,
      name: flag.name,
      key: flag.key,
      description: flag.description,
      flagType: flag.flagType,
      projectId: flag.projectId,
      createdBy: flag.createdBy,
      environments: flag.flagEnvironments
        .sort((a, b) => (a.environment.sortOrder || 0) - (b.environment.sortOrder || 0))
        .map(fe => ({
          id: fe.id,
          environmentId: fe.environmentId,
          environmentName: fe.environment.name,
          environmentKey: fe.environment.key,
          enabled: fe.enabled,
          defaultValue: fe.defaultValue,
          targetingRules: fe.targetingRules.map(tr => ({
            id: tr.id,
            name: tr.name,
            operator: tr.operator,
            serveValue: tr.serveValue,
            isDefault: tr.isDefault,
            priority: tr.priority,
            conditions: tr.conditions
          }))
        })),
      createdAt: flag.createdAt,
      updatedAt: flag.updatedAt
    });
  } catch (error) {
    next(error);
  }
};

export const createFeatureFlag = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const { name, key, description, flagType = 'BOOLEAN' } = req.body;
    const userId = req.user!.userId;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create flag
      const flag = await tx.featureFlag.create({
        data: {
          name,
          key,
          description,
          flagType,
          organizationId: project.organizationId,
          projectId,
          createdById: userId
        }
      });

      // Create flag environments for each environment
      // Use provided defaultValue or fall back to type-based defaults
      const defaultValue = req.body.defaultValue !== undefined ? req.body.defaultValue :
                          flagType === 'BOOLEAN' ? 'false' : 
                          flagType === 'NUMBER' ? '0' : 
                          flagType === 'JSON' ? '{}' : '';

      await tx.flagEnvironment.createMany({
        data: project.environments.map(env => ({
          flagId: flag.id,
          environmentId: env.id,
          enabled: false,
          defaultValue
        }))
      });

      // Fetch the flag with environments to return
      const createdFlag = await tx.featureFlag.findUnique({
        where: { id: flag.id },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true }
          },
          flagEnvironments: {
            include: {
              environment: {
                select: { id: true, name: true, key: true, sortOrder: true }
              }
            }
          }
        }
      });

      if (!createdFlag) return null;

      return {
        ...createdFlag,
        environments: createdFlag.flagEnvironments
          .sort((a, b) => (a.environment.sortOrder || 0) - (b.environment.sortOrder || 0))
          .map(fe => ({
            id: fe.id,
            environmentId: fe.environmentId,
            environmentName: fe.environment.name,
            environmentKey: fe.environment.key,
            enabled: fe.enabled,
            defaultValue: fe.defaultValue
          }))
      };
    });

    await createAuditLog({
      action: 'CREATE',
      entityType: 'FEATURE_FLAG',
      entityId: result!.id,
      organizationId: project.organizationId,
      projectId,
      userId,
      newValues: { name, key, description, flagType }
    });

    // Return flag with environments
    res.status(201).json({
      id: result!.id,
      name: result!.name,
      key: result!.key,
      description: result!.description,
      flagType: result!.flagType,
      createdBy: result!.createdBy,
      environments: result!.flagEnvironments.map(fe => ({
        id: fe.id,
        environmentId: fe.environmentId,
        environmentName: fe.environment.name,
        environmentKey: fe.environment.key,
        enabled: fe.enabled,
        defaultValue: fe.defaultValue
      })),
      createdAt: result!.createdAt,
      updatedAt: result!.updatedAt
    });
  } catch (error) {
    next(error);
  }
};

export const updateFeatureFlag = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { flagId } = req.params;
    const { name, description } = req.body;
    const userId = req.user!.userId;

    const flag = await prisma.featureFlag.findUnique({
      where: { id: flagId }
    });

    if (!flag) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }

    const updated = await prisma.featureFlag.update({
      where: { id: flagId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        updatedById: userId
      }
    });

    await createAuditLog({
      action: 'UPDATE',
      entityType: 'FEATURE_FLAG',
      entityId: flagId,
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      userId,
      oldValues: { name: flag.name, description: flag.description },
      newValues: { name: name || flag.name, description: description !== undefined ? description : flag.description }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteFeatureFlag = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { flagId } = req.params;
    const userId = req.user!.userId;

    if (!isValidObjectId(flagId)) {
      return sendInvalidIdError(res, 'Flag ID');
    }

    const flag = await prisma.featureFlag.findUnique({
      where: { id: flagId },
      include: { flagEnvironments: true }
    });

    if (!flag) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }

    // Invalidate cache for all environments
    for (const fe of flag.flagEnvironments) {
      await invalidateFlagCache(fe.environmentId, flag.key);
    }

    // Delete in transaction: first flagEnvironments, then the flag
    await prisma.$transaction(async (tx) => {
      // Delete flagEnvironments first
      await tx.flagEnvironment.deleteMany({
        where: { flagId }
      });
      
      // Then delete the flag
      await tx.featureFlag.delete({
        where: { id: flagId }
      });
    });

    await createAuditLog({
      action: 'DELETE',
      entityType: 'FEATURE_FLAG',
      entityId: flagId,
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      userId,
      oldValues: { name: flag.name, key: flag.key }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const toggleFlag = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { flagId } = req.params;
    const { environmentId, enabled } = req.body;
    const userId = req.user!.userId;

    // Find flag environment by flagId and environmentId
    // Filter for non-brand specific environments (brandId is null or undefined)
    const flagEnvs = await prisma.flagEnvironment.findMany({
      where: {
        flagId,
        environmentId
      },
      include: {
        flag: true,
        environment: true
      }
    });

    // Filter for environments without a brand (single-tenant projects)
    const nonBrandEnvs = flagEnvs.filter(fe => !fe.brandId);
    
    if (nonBrandEnvs.length === 0) {
      return res.status(404).json({ error: 'Flag environment not found' });
    }

    const flagEnv = nonBrandEnvs[0];

    const updated = await prisma.flagEnvironment.update({
      where: { id: flagEnv.id },
      data: { enabled }
    });

    // Invalidate cache
    await invalidateFlagCache(environmentId, flagEnv.flag.key);

    await createAuditLog({
      action: 'TOGGLE',
      entityType: 'FLAG_ENVIRONMENT',
      entityId: flagEnv.id,
      organizationId: flagEnv.flag.organizationId,
      projectId: flagEnv.flag.projectId,
      userId,
      oldValues: { enabled: flagEnv.enabled },
      newValues: { enabled }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const updateFlagValue = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { flagId } = req.params;
    const { environmentId, defaultValue } = req.body;
    const userId = req.user!.userId;

    // Find flag environment by flagId and environmentId
    const flagEnvs = await prisma.flagEnvironment.findMany({
      where: {
        flagId,
        environmentId
      },
      include: {
        flag: true
      }
    });

    // Filter for environments without a brand (single-tenant projects)
    const nonBrandEnvs = flagEnvs.filter(fe => !fe.brandId);
    
    if (nonBrandEnvs.length === 0) {
      return res.status(404).json({ error: 'Flag environment not found' });
    }

    const flagEnv = nonBrandEnvs[0];

    const updated = await prisma.flagEnvironment.update({
      where: { id: flagEnv.id },
      data: { defaultValue }
    });

    await invalidateFlagCache(environmentId, flagEnv.flag.key);

    await createAuditLog({
      action: 'UPDATE_VALUE',
      entityType: 'FLAG_ENVIRONMENT',
      entityId: flagEnv.id,
      organizationId: flagEnv.flag.organizationId,
      projectId: flagEnv.flag.projectId,
      userId,
      oldValues: { defaultValue: flagEnv.defaultValue },
      newValues: { defaultValue }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const getFlagEnvironments = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { flagId } = req.params;

    if (!isValidObjectId(flagId)) {
      return sendInvalidIdError(res, 'Flag ID');
    }

    const flagEnvs = await prisma.flagEnvironment.findMany({
      where: { flagId },
      include: {
        environment: {
          select: {
            id: true,
            name: true,
            key: true
          }
        },
        targetingRules: {
          include: {
            conditions: true
          }
        }
      }
    });

    res.json(flagEnvs);
  } catch (error) {
    next(error);
  }
};

export const updateFlagEnvironment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { flagId, environmentId } = req.params;
    const { enabled, defaultValue } = req.body;

    if (!isValidObjectId(flagId)) {
      return sendInvalidIdError(res, 'Flag ID');
    }
    if (!isValidObjectId(environmentId)) {
      return sendInvalidIdError(res, 'Environment ID');
    }

    // Find flag environment (single-tenant: no brand)
    const flagEnvs = await prisma.flagEnvironment.findMany({
      where: {
        flagId,
        environmentId
      },
      include: { flag: true }
    });

    // Filter for environments without a brand
    const nonBrandEnvs = flagEnvs.filter(fe => !fe.brandId);
    
    if (nonBrandEnvs.length === 0) {
      return res.status(404).json({ error: 'Flag environment not found' });
    }

    const flagEnv = nonBrandEnvs[0];

    const updated = await prisma.flagEnvironment.update({
      where: { id: flagEnv.id },
      data: {
        ...(enabled !== undefined && { enabled }),
        ...(defaultValue !== undefined && { defaultValue })
      }
    });

    await invalidateFlagCache(environmentId, flagEnv.flag.key);

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const createTargetingRule = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { flagId, environmentId } = req.params;
    const { name, operator = 'AND', serveValue, conditions, priority = 0 } = req.body;

    if (!isValidObjectId(flagId)) {
      return sendInvalidIdError(res, 'Flag ID');
    }
    if (!isValidObjectId(environmentId)) {
      return sendInvalidIdError(res, 'Environment ID');
    }

    // Find flag environment (single-tenant: no brand)
    const flagEnvs = await prisma.flagEnvironment.findMany({
      where: {
        flagId,
        environmentId
      }
    });

    // Filter for environments without a brand
    const nonBrandEnvs = flagEnvs.filter(fe => !fe.brandId);
    
    if (nonBrandEnvs.length === 0) {
      return res.status(404).json({ error: 'Flag environment not found' });
    }

    const flagEnv = nonBrandEnvs[0];

    const rule = await prisma.targetingRule.create({
      data: {
        flagEnvId: flagEnv.id,
        name,
        operator,
        serveValue,
        priority,
        conditions: {
          create: conditions || []
        }
      },
      include: {
        conditions: true
      }
    });

    res.status(201).json(rule);
  } catch (error) {
    next(error);
  }
};

export const updateTargetingRule = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { ruleId } = req.params;
    const { name, operator, serveValue, conditions, priority } = req.body;

    if (!isValidObjectId(ruleId)) {
      return sendInvalidIdError(res, 'Rule ID');
    }

    // Update rule and conditions
    const rule = await prisma.$transaction(async (tx) => {
      // Delete existing conditions
      await tx.ruleCondition.deleteMany({
        where: { ruleId }
      });

      // Update rule and create new conditions
      const updated = await tx.targetingRule.update({
        where: { id: ruleId },
        data: {
          ...(name && { name }),
          ...(operator && { operator }),
          ...(serveValue !== undefined && { serveValue }),
          ...(priority !== undefined && { priority }),
          conditions: {
            create: conditions || []
          }
        },
        include: {
          conditions: true
        }
      });

      return updated;
    });

    res.json(rule);
  } catch (error) {
    next(error);
  }
};

export const deleteTargetingRule = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { ruleId } = req.params;

    if (!isValidObjectId(ruleId)) {
      return sendInvalidIdError(res, 'Rule ID');
    }

    await prisma.targetingRule.delete({
      where: { id: ruleId }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

