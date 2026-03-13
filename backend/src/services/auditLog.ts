import { prisma } from '../utils/prisma';

interface AuditLogParams {
  action: string;
  entityType: string;
  entityId: string;
  organizationId: string;
  projectId?: string;
  userId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export const createAuditLog = async (params: AuditLogParams) => {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        organizationId: params.organizationId,
        projectId: params.projectId,
        userId: params.userId,
        oldValues: params.oldValues || {},
        newValues: params.newValues || {},
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
};

export const getAuditLogs = async (
  organizationId: string,
  options: {
    projectId?: string;
    userId?: string;
    entityType?: string;
    limit?: number;
    offset?: number;
  } = {}
) => {
  const { projectId, userId, entityType, limit = 50, offset = 0 } = options;

  const where = {
    organizationId,
    ...(projectId && { projectId }),
    ...(userId && { userId }),
    ...(entityType && { entityType }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
};
