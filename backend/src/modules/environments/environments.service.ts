import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { ChangeEventsService } from '../change-events/change-events.service'
import { ENVIRONMENT_ORDER_BY } from './environment-order'

@Injectable()
export class EnvironmentsService {
  private readonly logger = new Logger(EnvironmentsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly changes: ChangeEventsService
  ) {}

  async findByProject(projectId: string) {
    return this.prisma.environment.findMany({
      where: { projectId },
      orderBy: ENVIRONMENT_ORDER_BY,
    })
  }

  /**
   * Creates an environment at the end of the project's order. `organizationId`
   * must be the owning organization of the project as resolved server-side
   * (never taken from the request).
   */
  async create(
    projectId: string,
    organizationId: string,
    data: { name: string; key: string }
  ) {
    const last = await this.prisma.environment.findFirst({
      where: { projectId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const environment = await this.prisma.environment.create({
      data: {
        name: data.name,
        key: data.key,
        projectId,
        organizationId,
        sortOrder: last ? last.sortOrder + 1 : 0,
      },
    })
    void this.changes.recordChange({
      organizationId,
      projectId,
      environmentIds: [environment.id],
      changes: [{ action: 'environment_changed' }],
    })
    return environment
  }

  async update(envId: string, data: { name?: string }) {
    const updateData: { name?: string } = {}
    if (data.name !== undefined) updateData.name = data.name
    const environment = await this.prisma.environment.update({
      where: { id: envId },
      data: updateData,
    })
    void this.changes.recordChange({
      organizationId: environment.organizationId,
      projectId: environment.projectId,
      environmentIds: [environment.id],
      changes: [{ action: 'environment_changed' }],
    })
    return environment
  }

  async delete(envId: string) {
    // Delete all flag environments for this environment first (cascading delete for MongoDB)
    await this.prisma.flagEnvironment.deleteMany({
      where: { environmentId: envId },
    })
    const environment = await this.prisma.environment.delete({
      where: { id: envId },
    })

    // Awaited (never throws): the version increment must happen before the
    // config version document is removed, or it would be recreated.
    await this.changes.recordChange({
      organizationId: environment.organizationId,
      projectId: environment.projectId,
      environmentIds: [environment.id],
      changes: [{ action: 'environment_changed' }],
      environmentKeys: { [environment.id]: environment.key },
    })
    try {
      await this.prisma.configVersion.deleteMany({
        where: {
          projectId: environment.projectId,
          environmentId: environment.id,
        },
      })
    } catch (error) {
      // The environment is gone; a leftover version document is harmless.
      this.logger.warn(
        `Config version cleanup for environment ${envId} failed: ${String(error)}`
      )
    }
    try {
      await this.removeFromWebhookScopes(environment)
    } catch (error) {
      // A stale id in a webhook scope matches nothing, so it stays safe.
      this.logger.warn(
        `Webhook scope cleanup for environment ${envId} failed: ${String(error)}`
      )
    }
  }

  /**
   * Removes a deleted environment from webhook scopes. An empty scope means
   * "all environments", so a webhook that was scoped only to the deleted
   * environment is disabled instead of silently widened (audited, actor
   * system).
   */
  private async removeFromWebhookScopes(environment: {
    id: string
    projectId: string
  }) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        projectId: environment.projectId,
        environmentIds: { has: environment.id },
      },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        environmentIds: true,
        enabled: true,
      },
    })
    for (const webhook of webhooks) {
      const remaining = webhook.environmentIds.filter(
        (id) => id !== environment.id
      )
      const emptied = remaining.length === 0
      // Conditional: skipped if the scope was changed meanwhile
      const { count } = await this.prisma.webhook.updateMany({
        where: { id: webhook.id, environmentIds: { has: environment.id } },
        data: emptied
          ? { environmentIds: { set: [] }, enabled: false }
          : { environmentIds: { set: remaining } },
      })
      if (count !== 1 || !emptied) continue
      this.logger.warn(
        `Webhook ${webhook.id} disabled: its only environment ${environment.id} was deleted`
      )
      await this.prisma.auditLog.create({
        data: {
          action: 'webhook.disabled_environment_deleted',
          entityType: 'webhook',
          entityId: webhook.id,
          organizationId: webhook.organizationId,
          projectId: webhook.projectId,
          oldValues: {
            enabled: webhook.enabled,
            environmentIds: webhook.environmentIds,
          },
          newValues: {
            enabled: false,
            environmentIds: [],
            deletedEnvironmentId: environment.id,
            actor: 'system',
          },
        },
      })
    }
  }

  /**
   * Persists a new order. `environmentIds` must be exactly the project's
   * environments (each once); anything else is rejected with 400 so a stale
   * or foreign list can never leave the order half-applied. Returns the
   * environments in their new order.
   */
  async reorder(
    projectId: string,
    organizationId: string,
    userId: string,
    environmentIds: string[]
  ) {
    const current = await this.prisma.environment.findMany({
      where: { projectId },
      orderBy: ENVIRONMENT_ORDER_BY,
      select: { id: true },
    })
    const currentIds = current.map((e) => e.id)
    const known = new Set(currentIds)
    const requested = new Set(environmentIds)

    if (
      requested.size !== environmentIds.length ||
      environmentIds.length !== currentIds.length ||
      environmentIds.some((id) => !known.has(id))
    ) {
      throw new BadRequestException(
        'environmentIds must list every environment of the project exactly once'
      )
    }

    // updateMany scoped to the project: an environment deleted meanwhile is
    // skipped instead of failing the whole transaction.
    await this.prisma.$transaction(
      environmentIds.map((id, index) =>
        this.prisma.environment.updateMany({
          where: { id, projectId },
          data: { sortOrder: index },
        })
      )
    )

    try {
      await this.auditLogs.create({
        action: 'environment.reordered',
        entityType: 'Project',
        entityId: projectId,
        userId,
        organizationId,
        projectId,
        oldValues: { environmentIds: currentIds },
        newValues: { environmentIds },
      })
    } catch (error) {
      // The order is already persisted; a missing audit entry must not turn
      // the request into an error the client would retry.
      this.logger.warn(`Audit log for environment reorder failed: ${error}`)
    }

    return this.findByProject(projectId)
  }
}
