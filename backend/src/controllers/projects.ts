import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { createAuditLog } from '../services/auditLog';

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

const sendInvalidIdError = (res: Response, fieldName: string = 'ID') => {
  res.status(400).json({ error: `Invalid ${fieldName} format` });
};

// Get all projects for the current user across all organizations
export const getMyProjects = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    // Get all organizations the user is a member of
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true }
    });

    const orgIds = memberships.map(m => m.organizationId);

    const projects = await prisma.project.findMany({
      where: { organizationId: { in: orgIds } },
      include: {
        organization: {
          select: { name: true }
        },
        _count: {
          select: {
            featureFlags: true,
            environments: true
          }
        }
      }
    });

    res.json(projects.map(p => ({
      id: p.id,
      name: p.name,
      key: p.key,
      slug: p.key,
      description: p.description,
      type: p.type,
      organizationId: p.organizationId,
      organizationName: p.organization.name,
      flagCount: p._count.featureFlags,
      environmentCount: p._count.environments,
      createdAt: p.createdAt
    })));
  } catch (error) {
    next(error);
  }
};

export const getProjects = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;

    const projects = await prisma.project.findMany({
      where: { organizationId: orgId },
      include: {
        _count: {
          select: {
            featureFlags: true,
            environments: true
          }
        }
      }
    });

    res.json(projects.map(p => ({
      id: p.id,
      name: p.name,
      key: p.key,
      slug: p.key,
      description: p.description,
      type: p.type,
      flagCount: p._count.featureFlags,
      environmentCount: p._count.environments,
      createdAt: p.createdAt
    })));
  } catch (error) {
    next(error);
  }
};

export const getProject = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    if (!isValidObjectId(projectId)) {
      return sendInvalidIdError(res, 'Project ID');
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: {
          select: { name: true }
        },
        environments: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            key: true,
            sortOrder: true
          }
        },
        _count: {
          select: {
            featureFlags: true
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      id: project.id,
      name: project.name,
      key: project.key,
      slug: project.key,
      description: project.description,
      type: project.type,
      allowedOrigins: project.allowedOrigins || [],
      organizationId: project.organizationId,
      organizationName: project.organization.name,
      environments: project.environments,
      flagCount: project._count.featureFlags,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;
    const { name, key, description, type = 'SINGLE' } = req.body;
    const userId = req.user!.userId;

    const project = await prisma.project.create({
      data: {
        name,
        key,
        description,
        type,
        organizationId: orgId
      }
    });

    // Create default environments
    await prisma.environment.createMany({
      data: [
        { name: 'Development', key: 'development', projectId: project.id, organizationId: orgId },
        { name: 'Production', key: 'production', projectId: project.id, organizationId: orgId }
      ]
    });

    await createAuditLog({
      action: 'CREATE',
      entityType: 'PROJECT',
      entityId: project.id,
      organizationId: orgId,
      projectId: project.id,
      userId,
      newValues: { name, key, description }
    });

    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const { name, description, type, allowedOrigins } = req.body;
    const userId = req.user!.userId;

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const oldType = project.type;
    const newType = type || oldType;

    // If changing from MULTI to SINGLE, clean up brand-specific flag environments
    if (oldType === 'MULTI' && newType === 'SINGLE') {
      // Get all flags in this project
      const flags = await prisma.featureFlag.findMany({
        where: { projectId },
        select: { id: true }
      });
      const flagIds = flags.map(f => f.id);

      if (flagIds.length > 0) {
        // Delete all brand-specific flag environments
        const deletedCount = await prisma.flagEnvironment.deleteMany({
          where: {
            flagId: { in: flagIds },
            brandId: { not: null }
          }
        });
        console.log(`Cleaned up ${deletedCount.count} brand-specific flag environments`);
      }

      // Also delete all brands since they won't be used anymore
      await prisma.brand.deleteMany({
        where: { projectId }
      });
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(type && { type }),
        ...(allowedOrigins !== undefined && { allowedOrigins })
      }
    });

    await createAuditLog({
      action: 'UPDATE',
      entityType: 'PROJECT',
      entityId: projectId,
      organizationId: project.organizationId,
      projectId,
      userId,
      oldValues: { name: project.name, description: project.description, type: oldType, allowedOrigins: project.allowedOrigins },
      newValues: { name: name || project.name, description: description !== undefined ? description : project.description, type: newType, allowedOrigins: allowedOrigins !== undefined ? allowedOrigins : project.allowedOrigins }
    });

    res.json({
      ...updated,
      message: (oldType === 'MULTI' && newType === 'SINGLE') 
        ? 'Project converted to single-tenant. All brand-specific configurations have been removed.'
        : undefined
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.userId;

    if (!isValidObjectId(projectId)) {
      return sendInvalidIdError(res, 'Project ID');
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete in transaction with proper dependency order
    await prisma.$transaction(async (tx) => {
      // 1. Delete API keys associated with this project
      await tx.apiKey.deleteMany({
        where: { projectId }
      });
      
      // 2. Delete audit logs for this project
      await tx.auditLog.deleteMany({
        where: { projectId }
      });
      
      // 3. Delete feature flags and their environments
      const flags = await tx.featureFlag.findMany({
        where: { projectId },
        select: { id: true }
      });
      const flagIds = flags.map(f => f.id);

      if (flagIds.length > 0) {
        // Delete all flag environments (including brand-specific ones)
        const flagEnvs = await tx.flagEnvironment.findMany({
          where: { flagId: { in: flagIds } },
          select: { id: true }
        });
        const flagEnvIds = flagEnvs.map(fe => fe.id);

        if (flagEnvIds.length > 0) {
          // Delete targeting rules
          const targetingRules = await tx.targetingRule.findMany({
            where: { flagEnvId: { in: flagEnvIds } },
            select: { id: true }
          });
          const targetingRuleIds = targetingRules.map(tr => tr.id);
          
          if (targetingRuleIds.length > 0) {
            await tx.ruleCondition.deleteMany({
              where: { ruleId: { in: targetingRuleIds } }
            });
          }
          
          await tx.targetingRule.deleteMany({
            where: { flagEnvId: { in: flagEnvIds } }
          });
        }

        await tx.flagEnvironment.deleteMany({
          where: { flagId: { in: flagIds } }
        });
        await tx.featureFlag.deleteMany({
          where: { projectId }
        });
      }

      // 4. Delete brands (for multi-tenant projects)
      await tx.brand.deleteMany({
        where: { projectId }
      });

      // 5. Delete environments
      await tx.environment.deleteMany({
        where: { projectId }
      });

      // 6. Finally delete the project
      await tx.project.delete({
        where: { id: projectId }
      });
    });

    await createAuditLog({
      action: 'DELETE',
      entityType: 'PROJECT',
      entityId: projectId,
      organizationId: project.organizationId,
      userId,
      oldValues: { name: project.name, key: project.key }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// Get all flags with brand values for a project (optimized for multi-tenant)
export const getProjectFlagsWithBrands = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    if (!isValidObjectId(projectId)) {
      return sendInvalidIdError(res, 'Project ID');
    }

    // Get project with all related data in one query
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        environments: {
          orderBy: { sortOrder: 'asc' }
        },
        brands: {
          orderBy: { createdAt: 'asc' }
        },
        featureFlags: {
          include: {
            flagEnvironments: {
              include: {
                environment: {
                  select: { id: true, name: true, key: true, sortOrder: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Transform flags to include brand values per environment
    const transformedFlags = project.featureFlags.map(flag => {
      const environments = project.environments.map(env => {
        // Find default flag environment (no brand)
        const defaultFlagEnv = flag.flagEnvironments.find(
          fe => fe.environmentId === env.id && !fe.brandId
        );

        // Get brand values for this environment
        const brandValues = project.brands.map(brand => {
          const brandFlagEnv = flag.flagEnvironments.find(
            fe => fe.environmentId === env.id && fe.brandId === brand.id
          );

          return {
            brandId: brand.id,
            brandName: brand.name,
            enabled: brandFlagEnv?.enabled ?? defaultFlagEnv?.enabled ?? false,
            defaultValue: brandFlagEnv?.defaultValue ?? defaultFlagEnv?.defaultValue ?? '',
            isCustom: !!brandFlagEnv
          };
        });

        return {
          id: defaultFlagEnv?.id || `${flag.id}-${env.id}`,
          environmentId: env.id,
          environmentName: env.name,
          enabled: defaultFlagEnv?.enabled ?? false,
          defaultValue: defaultFlagEnv?.defaultValue ?? '',
          brandValues
        };
      });

      return {
        id: flag.id,
        name: flag.name,
        key: flag.key,
        description: flag.description,
        flagType: flag.flagType,
        createdAt: flag.createdAt,
        updatedAt: flag.updatedAt,
        environments
      };
    });

    res.json({
      project: {
        id: project.id,
        name: project.name,
        key: project.key,
        type: project.type,
        description: project.description,
        organizationId: project.organizationId
      },
      flags: transformedFlags
    });
  } catch (error) {
    next(error);
  }
};
