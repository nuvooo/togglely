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
          select: {
            id: true,
            name: true,
            key: true
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
    const { name, key, description } = req.body;
    const userId = req.user!.userId;

    const project = await prisma.project.create({
      data: {
        name,
        key,
        description,
        organizationId: orgId
      }
    });

    // Create default environments
    await prisma.environment.createMany({
      data: [
        { name: 'Development', key: 'development', projectId: project.id, organizationId: orgId },
        { name: 'Staging', key: 'staging', projectId: project.id, organizationId: orgId },
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
    const { name, description } = req.body;
    const userId = req.user!.userId;

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description })
      }
    });

    await createAuditLog({
      action: 'UPDATE',
      entityType: 'PROJECT',
      entityId: projectId,
      organizationId: project.organizationId,
      projectId,
      userId,
      oldValues: { name: project.name, description: project.description },
      newValues: { name: name || project.name, description: description !== undefined ? description : project.description }
    });

    res.json(updated);
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

    // Delete in transaction: first environments, then the project
    await prisma.$transaction(async (tx) => {
      // 1. Delete feature flags and their environments
      const flags = await tx.featureFlag.findMany({
        where: { projectId },
        select: { id: true }
      });
      const flagIds = flags.map(f => f.id);

      if (flagIds.length > 0) {
        // Delete flag environments first
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

      // 2. Delete environments
      await tx.environment.deleteMany({
        where: { projectId }
      });

      // 3. Finally delete the project
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
