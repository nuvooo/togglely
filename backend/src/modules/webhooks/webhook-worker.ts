import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'
import { WebhookDeliveryService } from './webhook-delivery.service'

export const WORKER_INTERVAL_MS = 10_000
export const WORKER_BATCH_SIZE = 20
export const DELIVERY_RETENTION_DAYS = 30
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000
const CLEANUP_INITIAL_DELAY_MS = 60_000

/**
 * Polls the DB-backed delivery queue: every 10 s it claims up to 20 due
 * deliveries (atomic per-document lock, safe with several instances) and
 * attempts them. Deliveries survive restarts because the queue is the
 * database. Deletes deliveries older than 30 days once a day.
 *
 * WEBHOOK_WORKER_DISABLED=true turns the timers off (tests, or instances
 * that should only serve the API).
 */
@Injectable()
export class WebhookWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookWorker.name)
  private interval?: ReturnType<typeof setInterval>
  private cleanupTimer?: ReturnType<typeof setTimeout>
  private running: Promise<number> | null = null
  private rerun = false
  private enabled = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: WebhookDeliveryService
  ) {}

  onModuleInit() {
    if (process.env.WEBHOOK_WORKER_DISABLED === 'true') {
      this.logger.log('Webhook worker disabled (WEBHOOK_WORKER_DISABLED=true)')
      return
    }
    this.enabled = true
    this.interval = setInterval(() => this.runSafely(), WORKER_INTERVAL_MS)
    this.interval.unref?.()

    const scheduleCleanup = (delay: number) => {
      this.cleanupTimer = setTimeout(() => {
        this.cleanup().catch((error) =>
          this.logger.warn(`Webhook delivery cleanup failed: ${String(error)}`)
        )
        scheduleCleanup(CLEANUP_INTERVAL_MS)
      }, delay)
      this.cleanupTimer.unref?.()
    }
    scheduleCleanup(CLEANUP_INITIAL_DELAY_MS)
  }

  onModuleDestroy() {
    this.enabled = false
    if (this.interval) clearInterval(this.interval)
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer)
  }

  /** Processes new deliveries right away instead of waiting for the poll. */
  trigger() {
    if (!this.enabled) return
    setImmediate(() => this.runSafely())
  }

  private runSafely() {
    this.tick().catch((error) =>
      this.logger.error(`Webhook worker tick failed: ${String(error)}`)
    )
  }

  /**
   * One polling round. Concurrent calls on the same instance join the
   * running round and schedule one follow-up round. Returns the number of
   * attempted deliveries.
   */
  async tick(): Promise<number> {
    if (this.running) {
      this.rerun = true
      await this.running
      return 0
    }
    this.running = this.processBatch()
    try {
      return await this.running
    } finally {
      this.running = null
      if (this.rerun && this.enabled) {
        this.rerun = false
        setImmediate(() => this.runSafely())
      }
      this.rerun = false
    }
  }

  private async processBatch(): Promise<number> {
    const ids = await this.deliveries.claimDue(WORKER_BATCH_SIZE)
    const results = await Promise.allSettled(
      ids.map((id) => this.deliveries.attempt(id))
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          `Webhook delivery attempt failed: ${String(result.reason)}`
        )
      }
    }
    return ids.length
  }

  /** Deletes deliveries older than the retention period. */
  async cleanup(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000
    )
    const { count } = await this.prisma.webhookDelivery.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    if (count) this.logger.log(`Deleted ${count} old webhook deliveries`)
    return count
  }
}
