import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import slugify from '../utils/slugify';
import { hashPassword } from '../utils/password';

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

const sendInvalidIdError = (res: Response, fieldName: string = 'ID') => {
  res.status(400).json({ error: `Invalid ${fieldName} format` });
};

export const getOrganizations = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            _count: {
              select: {
                members: true,
                projects: true
              }
            }
          }
        }
      }
    });

    res.json(memberships.map(m => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      description: m.organization.description,
      role: m.role,
      memberCount: m.organization._count.members,
      projectCount: m.organization._count.projects,
      createdAt: m.organization.createdAt
    })));
  } catch (error) {
    next(error);
  }
};

export const getOrganization = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;

    if (!isValidObjectId(orgId)) {
      return sendInvalidIdError(res, 'Organization ID');
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: {
          select: {
            members: true,
            projects: true
          }
        }
      }
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description,
      isActive: org.isActive,
      memberCount: org._count.members,
      projectCount: org._count.projects,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt
    });
  } catch (error) {
    next(error);
  }
};

export const createOrganization = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { name, description } = req.body;

    const slug = slugify(name);

    // Check if slug exists
    const existing = await prisma.organization.findUnique({
      where: { slug }
    });

    if (existing) {
      return res.status(409).json({ error: 'Organization with this name already exists' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name,
          slug,
          description
        }
      });

      await tx.organizationMember.create({
        data: {
          userId,
          organizationId: org.id,
          role: 'OWNER'
        }
      });

      return org;
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateOrganization = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;
    const { name, description } = req.body;

    if (!isValidObjectId(orgId)) {
      return sendInvalidIdError(res, 'Organization ID');
    }

    const updateData: any = {};
    if (name) {
      updateData.name = name;
      updateData.slug = slugify(name);
    }
    if (description !== undefined) updateData.description = description;

    const org = await prisma.organization.update({
      where: { id: orgId },
      data: updateData
    });

    res.json(org);
  } catch (error) {
    next(error);
  }
};

export const deleteOrganization = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;

    if (!isValidObjectId(orgId)) {
      return sendInvalidIdError(res, 'Organization ID');
    }

    // Delete all related data in correct order (foreign key constraints)
    await prisma.$transaction(async (tx) => {
      // 1. Delete audit logs
      await tx.auditLog.deleteMany({
        where: { organizationId: orgId }
      });

      // 2. Delete targeting rules (via flag environments -> flags)
      const projects = await tx.project.findMany({
        where: { organizationId: orgId },
        select: { id: true }
      });
      const projectIds = projects.map(p => p.id);

      if (projectIds.length > 0) {
        const flags = await tx.featureFlag.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true }
        });
        const flagIds = flags.map(f => f.id);

        if (flagIds.length > 0) {
          const flagEnvs = await tx.flagEnvironment.findMany({
            where: { flagId: { in: flagIds } },
            select: { id: true }
          });
          const flagEnvIds = flagEnvs.map(fe => fe.id);

          if (flagEnvIds.length > 0) {
            // Delete rule conditions first (via targeting rules)
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
            where: { projectId: { in: projectIds } }
          });
        }

        await tx.environment.deleteMany({
          where: { projectId: { in: projectIds } }
        });
        await tx.project.deleteMany({
          where: { organizationId: orgId }
        });
      }

      // 3. Delete API keys
      await tx.apiKey.deleteMany({
        where: { organizationId: orgId }
      });

      // 4. Delete organization members
      await tx.organizationMember.deleteMany({
        where: { organizationId: orgId }
      });

      // 5. Finally delete organization
      await tx.organization.delete({
        where: { id: orgId }
      });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getMembers = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;

    if (!isValidObjectId(orgId)) {
      return sendInvalidIdError(res, 'Organization ID');
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    res.json(members.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.role,
      joinedAt: m.createdAt
    })));
  } catch (error) {
    next(error);
  }
};

export const inviteMember = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;
    const { email, role = 'MEMBER' } = req.body;

    if (!isValidObjectId(orgId)) {
      return sendInvalidIdError(res, 'Organization ID');
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email }
    });

    let userId: string;

    if (!user) {
      // Create temporary user with random password
      const tempPassword = Math.random().toString(36).slice(-10);
      user = await prisma.user.create({
        data: {
          email,
          password: await hashPassword(tempPassword),
          firstName: 'Invited',
          lastName: 'User'
        }
      });
    }

    userId = user.id;

    // Check if already a member
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId
        }
      }
    });

    if (existingMember) {
      return res.status(409).json({ error: 'User is already a member' });
    }

    const member = await prisma.organizationMember.create({
      data: {
        userId,
        organizationId: orgId,
        role
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    res.status(201).json({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      role: member.role
    });
  } catch (error) {
    next(error);
  }
};

export const updateMemberRole = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, userId } = req.params;
    const { role } = req.body;

    if (!isValidObjectId(orgId)) {
      return sendInvalidIdError(res, 'Organization ID');
    }
    if (!isValidObjectId(userId)) {
      return sendInvalidIdError(res, 'User ID');
    }

    const member = await prisma.organizationMember.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId
        }
      },
      data: { role }
    });

    res.json(member);
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, userId } = req.params;

    if (!isValidObjectId(orgId)) {
      return sendInvalidIdError(res, 'Organization ID');
    }
    if (!isValidObjectId(userId)) {
      return sendInvalidIdError(res, 'User ID');
    }

    await prisma.organizationMember.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId
        }
      }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
