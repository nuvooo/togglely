import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../shared/prisma.service'
import {
  ORG_AUDIT_LOG_DEFAULT_LIMIT,
  ORG_AUDIT_LOG_MAX_LIMIT,
  OrgAuditLogQuery,
} from './audit-log-query'

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

const AUDIT_LOG_ORG_INCLUDE = {
  ...AUDIT_LOG_USER_INCLUDE,
  project: { select: { id: true, name: true, key: true } },
} as const

export const AUDIT_LOG_DEFAULT_LIMIT = 100
export const AUDIT_LOG_MAX_LIMIT = 200
/** Longest string kept in old/new values (e.g. large JSON flag values). */
export const AUDIT_VALUE_MAX_LENGTH = 1024
const TRUNCATED = '…[truncated]'

/** Copies `value` with every string longer than 1 KB cut off. */
export function truncateAuditValues(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > AUDIT_VALUE_MAX_LENGTH
      ? value.slice(0, AUDIT_VALUE_MAX_LENGTH) + TRUNCATED
      : value
  }
  if (Array.isArray(value)) return value.map(truncateAuditValues)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, truncateAuditValues(v)])
    )
  }
  return value
}

export interface AuditLogQuery {
  /**
   * Entries of one entity: its own entries plus entries of related entities
   * whose old/new values name it as `flagId` (targeting rules, brand values).
   */
  entityId?: string
  /** Default 100, at most 200. */
  limit?: number
}

/** A user of the organization log filter. */
export interface AuditLogUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  /** False for users removed from the organization since. */
  isMember: boolean
}

const clampLimit =(limit?: number) =>
  Math.min(Math.max(limit ?? AUDIT_LOG_DEFAULT_LIMIT, 1), AUDIT_LOG_MAX_LIMIT)

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
        oldValues: truncateAuditValues(data.oldValues) as any,
        newValues: truncateAuditValues(data.newValues) as any,
      },
    })
  }

  /** Latest logs of one project. Never queries without a project filter. */
  async findAll(projectId: string, query: AuditLogQuery = {}) {
    if (!projectId) return []
    const take = clampLimit(query.limit)
    if (!query.entityId) return this.findLatest({ projectId }, take)

    // Prisma has no JSON path filters for MongoDB: match the ids raw, then
    // load the entries with their user through the typed client.
    const entityId = query.entityId
    const matches = (await this.prisma.auditLog.findRaw({
      filter: {
        projectId: { $oid: projectId },
        $or: [
          { entityId },
          { 'newValues.flagId': entityId },
          { 'oldValues.flagId': entityId },
        ],
      },
      options: { projection: { _id: 1 }, sort: { createdAt: -1 }, limit: take },
    })) as unknown as { _id: { $oid: string } }[]
    const ids = matches.map((doc) => doc._id.$oid)
    if (!ids.length) return []
    return this.findLatest({ id: { in: ids } }, take)
  }

  /**
   * One page of an organization's log, newest first, with the acting user
   * and the project. Entries are ordered by (createdAt, id), so the cursor
   * `<createdAt>_<id>` of the last entry (`nextCursor`, passed back as
   * `before`) continues exactly, also inside a run of equal timestamps.
   * `nextCursor` is null on the last page.
   */
  async findOrganizationPage(
    organizationId: string,
    query: OrgAuditLogQuery
  ): Promise<{ auditLogs: any[]; nextCursor: string | null }> {
    if (!organizationId) return { auditLogs: [], nextCursor: null }
    const take = Math.min(
      Math.max(query.limit ?? ORG_AUDIT_LOG_DEFAULT_LIMIT, 1),
      ORG_AUDIT_LOG_MAX_LIMIT
    )
    const where: Prisma.AuditLogWhereInput = { organizationId }
    if (query.projectId) where.projectId = query.projectId
    if (query.userId) where.userId = query.userId
    if (query.action) where.action = { startsWith: query.action }
    if (query.before && query.beforeId) {
      where.OR = [
        { createdAt: { lt: query.before } },
        { createdAt: query.before, id: { lt: query.beforeId } },
      ]
    } else if (query.before) {
      where.createdAt = { lt: query.before }
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      include: AUDIT_LOG_ORG_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    })
    if (rows.length <= take) return { auditLogs: rows, nextCursor: null }

    const page = rows.slice(0, take)
    const last = page[take - 1]
    return {
      auditLogs: page,
      nextCursor: `${last.createdAt.toISOString()}_${last.id}`,
    }
  }

  /**
   * Everyone who can appear in the organization log: current members plus
   * users named in its entries (also those removed from the organization
   * since). Name and email only, sorted by display name.
   */
  async findOrganizationUsers(
    organizationId: string
  ): Promise<AuditLogUser[]> {
    if (!organizationId) return []
    const [logged, members] = await Promise.all([
      this.prisma.auditLog.aggregateRaw({
        pipeline: [
          {
            $match: {
              organizationId: { $oid: organizationId },
              userId: { $ne: null },
            },
          },
          { $group: { _id: '$userId' } },
        ],
      }) as unknown as Promise<{ _id: { $oid: string } | string }[]>,
      this.prisma.organizationMember.findMany({
        where: { organizationId },
        select: { userId: true },
      }),
    ])
    const memberIds = new Set(members.map((m) => m.userId))
    const ids = new Set(memberIds)
    for (const doc of logged) {
      const id = typeof doc._id === 'string' ? doc._id : doc._id?.$oid
      if (id) ids.add(id)
    }
    if (!ids.size) return []

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, email: true, firstName: true, lastName: true },
    })
    const label = (u: (typeof users)[number]) =>
      [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email
    return users
      .map((u) => ({ ...u, isMember: memberIds.has(u.id) }))
      .sort((a, b) => label(a).localeCompare(label(b)))
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

  private findLatest(
    where: Prisma.AuditLogWhereInput,
    take = AUDIT_LOG_DEFAULT_LIMIT
  ) {
    return this.prisma.auditLog.findMany({
      where,
      include: AUDIT_LOG_USER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take,
    })
  }
}
