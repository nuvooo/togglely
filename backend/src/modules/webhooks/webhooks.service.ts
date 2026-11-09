import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { Prisma, Webhook, WebhookDelivery } from '@prisma/client'
import { isObjectId } from '../../shared/access/access.service'
import { PrismaService } from '../../shared/prisma.service'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto'
import {
  assertPublicUrl,
  LookupAllFn,
  resolvePublicAddress,
  WebhookUrlError,
  webhookUrlPolicy,
} from './ssrf-guard'
import {
  lockFree,
  newLock,
  WebhookDeliveryService,
} from './webhook-delivery.service'
import { WebhookPayload } from './webhook-payload'
import { generateWebhookSecret, maskSecret } from './webhook-signer'

export const MAX_WEBHOOKS_PER_PROJECT = 10
export const DEFAULT_DELIVERY_LIMIT = 50
export const MAX_DELIVERY_LIMIT = 100

/** DI token for a DNS lookup override (tests). */
export const WEBHOOK_DNS_LOOKUP = 'WEBHOOK_DNS_LOOKUP'

export interface WebhookView {
  id: string
  projectId: string
  url: string
  description: string | null
  /** Empty = all environments */
  environmentIds: string[]
  enabled: boolean
  /** Always masked (`whsec_…abcd`) */
  secret: string
  consecutiveFailures: number
  lastDeliveryAt: Date | null
  lastStatus: string | null
  createdAt: Date
  updatedAt: Date
}

export interface WebhookDeliveryView {
  id: string
  webhookId: string
  eventId: string
  type: string
  status: string
  attempt: number
  responseCode: number | null
  responseBody: string | null
  error: string | null
  durationMs: number | null
  nextAttemptAt: Date | null
  /** Sent by a user (test event): no retries, not counted as failure */
  manual: boolean
  createdAt: Date
  updatedAt: Date
  event: unknown
}

export function toWebhookView(webhook: Webhook): WebhookView {
  return {
    id: webhook.id,
    projectId: webhook.projectId,
    url: webhook.url,
    description: webhook.description ?? null,
    environmentIds: webhook.environmentIds ?? [],
    enabled: webhook.enabled,
    secret: maskSecret(webhook.secret),
    consecutiveFailures: webhook.consecutiveFailures ?? 0,
    lastDeliveryAt: webhook.lastDeliveryAt ?? null,
    lastStatus: webhook.lastStatus ?? null,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  }
}

export function toDeliveryView(delivery: WebhookDelivery): WebhookDeliveryView {
  const event = delivery.event as { type?: unknown } | null
  return {
    id: delivery.id,
    webhookId: delivery.webhookId,
    eventId: delivery.eventId,
    type: typeof event?.type === 'string' ? event.type : 'flags.changed',
    status: delivery.status,
    attempt: delivery.attempt,
    responseCode: delivery.responseCode ?? null,
    responseBody: delivery.responseBody ?? null,
    error: delivery.error ?? null,
    durationMs: delivery.durationMs ?? null,
    nextAttemptAt: delivery.nextAttemptAt ?? null,
    manual: delivery.manual === true,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    event: delivery.event,
  }
}

interface Actor {
  userId: string
  organizationId: string
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly deliveries: WebhookDeliveryService,
    @Optional()
    @Inject(WEBHOOK_DNS_LOOKUP)
    private readonly lookup?: LookupAllFn
  ) {}

  async list(projectId: string): Promise<WebhookView[]> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    })
    return webhooks.map(toWebhookView)
  }

  /** Loads a webhook of the project or throws 404. */
  async findInProject(projectId: string, webhookId: string): Promise<Webhook> {
    const webhook = isObjectId(webhookId)
      ? await this.prisma.webhook.findFirst({
          where: { id: webhookId, projectId },
        })
      : null
    if (!webhook) throw new NotFoundException('Webhook not found')
    return webhook
  }

  async create(projectId: string, actor: Actor, dto: CreateWebhookDto) {
    const count = await this.prisma.webhook.count({ where: { projectId } })
    if (count >= MAX_WEBHOOKS_PER_PROJECT) {
      throw new BadRequestException({
        message: `A project can have at most ${MAX_WEBHOOKS_PER_PROJECT} webhooks`,
        error: 'Bad Request',
        code: 'webhook_limit_reached',
      })
    }
    const url = await this.validateUrl(dto.url)
    const environmentIds = await this.validateEnvironments(
      projectId,
      dto.environmentIds
    )
    const secret = generateWebhookSecret()

    const webhook = await this.prisma.webhook.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        url,
        secret,
        environmentIds,
        enabled: dto.enabled ?? true,
        description: dto.description?.trim() || null,
        consecutiveFailures: 0,
        createdById: actor.userId,
      },
    })
    await this.audit('webhook.created', webhook, actor, undefined, {
      url: webhook.url,
      environmentIds: webhook.environmentIds,
      enabled: webhook.enabled,
      description: webhook.description,
    })
    return { webhook: toWebhookView(webhook), secret }
  }

  async update(webhook: Webhook, actor: Actor, dto: UpdateWebhookDto) {
    const data: Prisma.WebhookUpdateInput = {}
    if (dto.url !== undefined) data.url = await this.validateUrl(dto.url)
    if (dto.environmentIds !== undefined) {
      data.environmentIds = await this.validateEnvironments(
        webhook.projectId,
        dto.environmentIds
      )
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null
    }
    if (dto.enabled !== undefined) {
      data.enabled = dto.enabled
      // Re-enabling starts a fresh failure streak
      if (dto.enabled && !webhook.enabled) data.consecutiveFailures = 0
    }

    const updated = await this.prisma.webhook.update({
      where: { id: webhook.id },
      data,
    })
    await this.audit(
      'webhook.updated',
      updated,
      actor,
      {
        url: webhook.url,
        environmentIds: webhook.environmentIds,
        enabled: webhook.enabled,
        description: webhook.description,
      },
      {
        url: updated.url,
        environmentIds: updated.environmentIds,
        enabled: updated.enabled,
        description: updated.description,
      }
    )
    return { webhook: toWebhookView(updated) }
  }

  async delete(webhook: Webhook, actor: Actor) {
    // Deliveries are removed by the relation's onDelete: Cascade
    await this.prisma.webhook.delete({ where: { id: webhook.id } })
    await this.audit('webhook.deleted', webhook, actor, {
      url: webhook.url,
      environmentIds: webhook.environmentIds,
    })
    return { success: true }
  }

  async rotateSecret(webhook: Webhook, actor: Actor) {
    const secret = generateWebhookSecret()
    const updated = await this.prisma.webhook.update({
      where: { id: webhook.id },
      data: { secret },
    })
    await this.audit('webhook.secret_rotated', updated, actor)
    return { webhook: toWebhookView(updated), secret }
  }

  /** Sends a `webhook.test` event right away and returns the result. */
  async sendTest(webhook: Webhook) {
    const payload = await this.buildTestPayload(webhook)
    // Locked from the start so the worker does not pick it up meanwhile
    const lock = newLock()
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventId: payload.id,
        event: payload as unknown as Prisma.InputJsonValue,
        attempt: 0,
        status: 'pending',
        // One-shot: no retries, no effect on the failure counter
        manual: true,
        nextAttemptAt: new Date(),
        ...lock,
      },
    })
    const result = await this.deliveries.attempt(delivery.id, {
      lockToken: lock.lockToken,
      allowDisabled: true,
      manual: true,
    })
    return { delivery: toDeliveryView(result ?? delivery) }
  }

  async listDeliveries(webhook: Webhook, limit?: number) {
    const take = Math.min(
      Math.max(Math.trunc(limit ?? DEFAULT_DELIVERY_LIMIT) || 1, 1),
      MAX_DELIVERY_LIMIT
    )
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { webhookId: webhook.id },
      orderBy: { createdAt: 'desc' },
      take,
    })
    return { deliveries: deliveries.map(toDeliveryView) }
  }

  /**
   * Resends a delivery immediately with the same event id (receivers can
   * deduplicate) and restarts its retry plan. The manual attempt itself
   * does not change the webhook's failure counter; later automatic retries
   * do.
   */
  async redeliver(webhook: Webhook, deliveryId: string) {
    const delivery = isObjectId(deliveryId)
      ? await this.prisma.webhookDelivery.findFirst({
          where: { id: deliveryId, webhookId: webhook.id },
          select: { id: true },
        })
      : null
    if (!delivery) throw new NotFoundException('Delivery not found')

    const now = new Date()
    const lock = newLock(now)
    const { count } = await this.prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, OR: lockFree(now) },
      data: {
        status: 'pending',
        attempt: 0,
        nextAttemptAt: now,
        ...lock,
      },
    })
    if (count !== 1) {
      throw new ConflictException('Delivery is currently being sent')
    }
    // Manual: this attempt does not change the webhook's failure counter
    const result = await this.deliveries.attempt(delivery.id, {
      lockToken: lock.lockToken,
      allowDisabled: true,
      manual: true,
    })
    if (!result) throw new NotFoundException('Delivery not found')
    return { delivery: toDeliveryView(result) }
  }

  private async buildTestPayload(webhook: Webhook): Promise<WebhookPayload> {
    const project = await this.prisma.project.findUnique({
      where: { id: webhook.projectId },
      select: { id: true, key: true },
    })
    const environment = await this.prisma.environment.findFirst({
      where: {
        projectId: webhook.projectId,
        ...(webhook.environmentIds.length
          ? { id: { in: webhook.environmentIds } }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, key: true },
    })
    const version = environment
      ? await this.prisma.configVersion.findFirst({
          where: {
            projectId: webhook.projectId,
            environmentId: environment.id,
          },
          select: { version: true },
        })
      : null
    return {
      id: `test_${randomUUID()}`,
      type: 'webhook.test',
      createdAt: new Date().toISOString(),
      organizationId: webhook.organizationId,
      project: { id: webhook.projectId, key: project?.key ?? '' },
      environment: environment
        ? { id: environment.id, key: environment.key }
        : null,
      version: version?.version ?? 0,
      changes: [],
    }
  }

  /**
   * Rejects URLs that violate the policy (scheme, credentials, private
   * targets). DNS failures are tolerated here: the receiver may not be
   * resolvable yet; every delivery re-checks before sending.
   */
  private async validateUrl(raw: string): Promise<string> {
    const value = raw.trim()
    const policy = webhookUrlPolicy()
    try {
      const url = assertPublicUrl(value, policy)
      await resolvePublicAddress(url.hostname, {
        allowPrivate: policy.allowPrivate,
        lookup: this.lookup,
      })
    } catch (error) {
      if (!(error instanceof WebhookUrlError)) throw error
      if (error.code !== 'dns_error') {
        throw new BadRequestException({
          message: error.message,
          error: 'Bad Request',
          code: error.code,
        })
      }
    }
    return value
  }

  private async validateEnvironments(
    projectId: string,
    environmentIds: string[] | undefined
  ): Promise<string[]> {
    const ids = [...new Set(environmentIds ?? [])]
    if (!ids.length) return []
    const found = await this.prisma.environment.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true },
    })
    if (found.length !== ids.length) {
      throw new BadRequestException({
        message: 'Environment not found in this project',
        error: 'Bad Request',
        code: 'environment_not_in_project',
      })
    }
    return ids
  }

  private async audit(
    action: string,
    webhook: Webhook,
    actor: Actor,
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>
  ) {
    await this.auditLogs.create({
      action,
      entityType: 'webhook',
      entityId: webhook.id,
      userId: actor.userId,
      organizationId: webhook.organizationId,
      projectId: webhook.projectId,
      oldValues,
      newValues,
    })
  }
}
