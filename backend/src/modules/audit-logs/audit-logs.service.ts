import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../shared/prisma.service'

const AUDIT_LOG_USER_INCLUDE = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
} as const

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    action: string
    entityType: string
    entityId: string
    userId: string
    organizationId: string
    projectId?: string
    oldValues?: any
    newValues?: any
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        userId: data.userId,
        organizationId: data.organizationId,
        projectId: data.projectId,
        oldValues: data.oldValues,
        newValues: data.newValues,
      },
    })
  }

  /** Latest logs of one project. Never queries without a project filter. */
  async findAll(projectId: string) {
    if (!projectId) return []
    return this.findLatest({ projectId })
  }

  async findByOrganization(organizationId: string) {
    if (!organizationId) return []
    return this.findLatest({ organizationId })
  }

  /** Latest logs of all organizations the user is a member of. */
  async findForUser(userId: string) {
    if (!userId) return []
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    })
    const organizationIds = memberships.map((m) => m.organizationId)
    if (!organizationIds.length) return []

    return this.findLatest({ organizationId: { in: organizationIds } })
  }

  private findLatest(where: Prisma.AuditLogWhereInput) {
    return this.prisma.auditLog.findMany({
      where,
      include: AUDIT_LOG_USER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }
}
