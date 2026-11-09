import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../shared/prisma.service'
import { isPrismaUniqueConstraintError } from '../../shared/prisma-errors'
import { CHANGE_BUS, ChangeBus } from '../change-events/change-bus'
import { FlagsChangedEvent } from '../change-events/change-events.types'
import { buildChangedPayload } from './webhook-payload'
import { WebhookWorker } from './webhook-worker'

/**
 * Turns change events from the ChangeBus into queued webhook deliveries.
 * With Redis every instance receives every event, so creation is
 * idempotent per (webhookId, eventId): a pre-check plus the unique index
 * for the remaining race.
 */
@Injectable()
export class WebhookDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcher.name)
  private unsubscribe?: () => void

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANGE_BUS) private readonly bus: ChangeBus,
    private readonly worker: WebhookWorker
  ) {}

  onModuleInit() {
    this.unsubscribe = this.bus.subscribe((event) => {
      this.dispatch(event).catch((error) =>
        this.logger.error(
          `Webhook dispatch for event ${event.eventId} failed: ${String(error)}`
        )
      )
    })
  }

  onModuleDestroy() {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  /** Returns the number of deliveries created by this call. */
  async dispatch(event: FlagsChangedEvent): Promise<number> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { projectId: event.projectId, enabled: true },
      select: { id: true, environmentIds: true },
    })
    const targets = webhooks.filter(
      (w) =>
        w.environmentIds.length === 0 ||
        w.environmentIds.includes(event.environmentId)
    )
    if (!targets.length) return 0

    const payload = buildChangedPayload(
      event
    ) as unknown as Prisma.InputJsonValue
    let created = 0
    for (const webhook of targets) {
      try {
        const existing = await this.prisma.webhookDelivery.findFirst({
          where: { webhookId: webhook.id, eventId: event.eventId },
          select: { id: true },
        })
        if (existing) continue
        await this.prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            eventId: event.eventId,
            event: payload,
            attempt: 0,
            status: 'pending',
            nextAttemptAt: new Date(),
            lockedUntil: null,
          },
        })
        created++
      } catch (error) {
        // Another instance queued it first
        if (isPrismaUniqueConstraintError(error)) continue
        this.logger.error(
          `Could not queue webhook ${webhook.id} for event ${event.eventId}: ${String(error)}`
        )
      }
    }
    if (created) this.worker.trigger()
    return created
  }
}
