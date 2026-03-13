import { Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { getAuditLogs as getAuditLogsService } from '../services/auditLog';
import { AuthenticatedRequest } from '../middleware/auth';

// Get audit logs for the current user across all organizations
export const getMyAuditLogs = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string || '10', 10);

    // Get all organizations the user is a member of
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true }
    });

    const orgIds = memberships.map(m => m.organizationId);

    const logs = await prisma.auditLog.findMany({
      where: { organizationId: { in: orgIds } },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        project: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    res.json({ logs });
  } catch (error) {
    next(error);
  }
};

export const getAuditLogs = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;
    const { projectId, userId, entityType, limit = '50', offset = '0' } = req.query;

    const result = await getAuditLogsService(orgId, {
      projectId: projectId as string | undefined,
      userId: userId as string | undefined,
      entityType: entityType as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10)
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};
