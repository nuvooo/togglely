import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Prisma, WebhookDelivery } from '@prisma/client'
import { PrismaService } from '../../shared/prisma.service'
import { webhookUrlPolicy } from './ssrf-guard'
import { sendWebhookRequest } from './webhook-http'
import {
  AUTO_DISABLE_THRESHOLD,
  planAfterFailure,
  WebhookPayload,
} from './webhook-payload'
import { signWebhook } from './webhook-signer'

/** DI token for the HTTP sender (replaceable in tests). */
export const WEBHOOK_SENDER = 'WEBHOOK_SENDER'
export type WebhookSender = typeof sendWebhookRequest

/** How long a claimed delivery stays locked (> request timeout). */
export const DELIVERY_LOCK_MS = 60_000

/** Lock is free when unset, null or expired. */
export function lockFree(now: Date): Prisma.WebhookDeliveryWhereInput[] {
  return [
    { lockedUntil: null },
    { lockedUntil: { isSet: false } },
    { lockedUntil: { lt: now } },
  ]
}

/** Lock fields for a new claim: expiry plus a token unique to the claimer. */
export function newLock(now = new Date()) {
  return {
    lockedUntil: new Date(now.getTime() + DELIVERY_LOCK_MS),
    lockToken: randomUUID(),
  }
}

export interface ClaimedDelivery {
  id: string
  lockToken: string
}

export interface AttemptOptions {
  /** Token returned by the claim; results are only written while it matches */
  lockToken: string
  /** Send even if the webhook is disabled (test, redeliver) */
  allowDisabled?: boolean
  /**
   * Triggered by a user (redeliver): the attempt does not change the
   * webhook's failure counter or status. Deliveries stored with
   * `manual: true` (test events) are always treated as manual.
   */
  manual?: boolean
}

/**
 * Executes webhook delivery attempts and keeps delivery/webhook state:
 * retry plan, failure counter and auto-disable. Callers must hold the
 * delivery's lock (see claim/claimDue) and pass its token to attempt().
 */
@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WEBHOOK_SENDER) private readonly send: WebhookSender
  ) {}

  /**
   * Atomically locks one delivery for this process and returns the lock
   * token, or null when another worker/instance holds it. Single-document
   * updates are atomic in MongoDB, so two concurrent claims can never both
   * succeed.
   */
  async claim(deliveryId: string, now = new Date()): Promise<string | null> {
    const lock = newLock(now)
    const { count } = await this.prisma.webhookDelivery.updateMany({
      where: { id: deliveryId, OR: lockFree(now) },
      data: lock,
    })
    return count === 1 ? lock.lockToken : null
  }

  /** Claims up to `limit` due pending deliveries. */
  async claimDue(limit: number, now = new Date()): Promise<ClaimedDelivery[]> {
    const candidates = await this.prisma.webhookDelivery.findMany({
      where: {
        status: 'pending',
        nextAttemptAt: { lte: now },
        OR: lockFree(now),
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    })
    const claimed: ClaimedDelivery[] = []
    for (const { id } of candidates) {
      const lock = newLock(now)
      // Re-checks status so a delivery finished meanwhile is not resent
      const { count } = await this.prisma.webhookDelivery.updateMany({
        where: { id, status: 'pending', OR: lockFree(now) },
        data: lock,
      })
      if (count === 1) claimed.push({ id, lockToken: lock.lockToken })
    }
    return claimed
  }

  /**
   * Sends one attempt for a claimed delivery, stores the result and
   * releases the lock. If the lock was lost meanwhile (expired and claimed
   * by another worker), nothing is written. Returns the stored delivery
   * (null if it vanished).
   */
  async attempt(
    deliveryId: string,
    options: AttemptOptions
  ): Promise<WebhookDelivery | null> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    })
    if (!delivery) return null
    const { webhook, ...row } = delivery

    if (!webhook || (!webhook.enabled && !options.allowDisabled)) {
      await this.writeResult(row.id, options.lockToken, {
        status: 'failed',
        error: 'webhook_disabled',
        nextAttemptAt: null,
      })
      return this.prisma.webhookDelivery.findUnique({ where: { id: row.id } })
    }

    const manual = options.manual === true || row.manual === true
    const payload = row.event as unknown as WebhookPayload
    const body = JSON.stringify(payload)
    const timestamp = Math.floor(Date.now() / 1000)
    const result = await this.send({
      url: webhook.url,
      body,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Togglely-Webhooks/1',
        'X-Togglely-Event': payload?.type ?? 'flags.changed',
        'X-Togglely-Delivery': row.id,
        'X-Togglely-Signature': signWebhook(webhook.secret, timestamp, body),
      },
      policy: webhookUrlPolicy(),
    })

    const now = new Date()
    const attempt = row.attempt + 1
    const plan = result.ok
      ? { status: 'success' as const, nextAttemptAt: null }
      : row.manual === true
        ? // Test events are one-shot: no retries
          { status: 'failed' as const, nextAttemptAt: null }
        : planAfterFailure(attempt, now)

    const written = await this.writeResult(row.id, options.lockToken, {
      attempt,
      status: plan.status,
      nextAttemptAt: plan.nextAttemptAt,
      responseCode: result.responseCode ?? null,
      responseBody: result.responseBody ?? null,
      error: result.ok ? null : (result.error ?? 'unknown_error'),
      durationMs: result.durationMs,
    })

    if (written && !manual) {
      await this.updateWebhookStats(webhook.id, result.ok, now).catch(
        (error) =>
          this.logger.warn(
            `Could not update webhook ${webhook.id} stats: ${String(error)}`
          )
      )
    }
    return this.prisma.webhookDelivery.findUnique({ where: { id: row.id } })
  }

  /**
   * Stores an attempt result and releases the lock, but only while this
   * caller still owns the lock. Returns false (and writes nothing) when it
   * was lost.
   */
  private async writeResult(
    deliveryId: string,
    lockToken: string,
    data: Prisma.WebhookDeliveryUpdateManyMutationInput
  ): Promise<boolean> {
    const { count } = await this.prisma.webhookDelivery.updateMany({
      where: { id: deliveryId, lockToken },
      data: { ...data, lockedUntil: null, lockToken: null },
    })
    if (count !== 1) {
      this.logger.warn(
        `Lost the lock on webhook delivery ${deliveryId}; result discarded`
      )
      return false
    }
    return true
  }

  private async updateWebhookStats(webhookId: string, ok: boolean, now: Date) {
    if (ok) {
      await this.prisma.webhook.update({
        where: { id: webhookId },
        data: {
          consecutiveFailures: 0,
          lastDeliveryAt: now,
          lastStatus: 'success',
        },
      })
      return
    }
    const webhook = await this.prisma.webhook.update({
      where: { id: webhookId },
      data: {
        consecutiveFailures: { increment: 1 },
        lastDeliveryAt: now,
        lastStatus: 'failed',
      },
    })
    if (
      webhook.consecutiveFailures < AUTO_DISABLE_THRESHOLD ||
      !webhook.enabled
    ) {
      return
    }
    // Conditional update: only one instance disables and audits
    const { count } = await this.prisma.webhook.updateMany({
      where: { id: webhookId, enabled: true },
      data: { enabled: false },
    })
    if (count !== 1) return
    this.logger.warn(
      `Webhook ${webhookId} disabled after ${webhook.consecutiveFailures} consecutive failures`
    )
    await this.prisma.auditLog.create({
      data: {
        action: 'webhook.auto_disabled',
        entityType: 'webhook',
        entityId: webhookId,
        organizationId: webhook.organizationId,
        projectId: webhook.projectId,
        oldValues: { enabled: true },
        newValues: {
          enabled: false,
          consecutiveFailures: webhook.consecutiveFailures,
          actor: 'system',
        },
      },
    })
  }
}
