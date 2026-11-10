import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'
import { ChangeEventsService } from '../change-events/change-events.service'
import { nextBoundaryAfter } from '../sdk/rule-schedule'

export const RULE_SCHEDULE_INTERVAL_MS = 30_000
export const RULE_SCHEDULE_BATCH_SIZE = 100

/**
 * Time windows change SDK results without any write, so the configuration
 * version (ETag, live stream) would not move. Every 30 s this worker finds
 * rules whose next window bound has passed, claims the bound atomically
 * (the old nextBoundaryAt is part of the filter: with several instances
 * exactly one wins) and records a rules_changed event.
 *
 * RULE_SCHEDULER_DISABLED=true turns the timer off.
 */
@Injectable()
export class RuleScheduleWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuleScheduleWorker.name)
  private interval?: ReturnType<typeof setInterval>
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeEventsService
  ) {}

  onModuleInit() {
    if (process.env.RULE_SCHEDULER_DISABLED === 'true') {
      this.logger.log('Rule scheduler disabled (RULE_SCHEDULER_DISABLED=true)')
      return
    }
    this.interval = setInterval(
      () => void this.runSafely(),
      RULE_SCHEDULE_INTERVAL_MS
    )
    this.interval.unref?.()
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval)
  }

  private async runSafely() {
    // A slow round is not overlapped by the next one
    if (this.running) return
    this.running = true
    try {
      await this.tick()
    } catch (error) {
      this.logger.error(`Rule scheduler tick failed: ${String(error)}`)
    } finally {
      this.running = false
    }
  }

  /** One round; returns the number of announced bounds. */
  async tick(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.targetingRule.findMany({
      where: { nextBoundaryAt: { lte: now } },
      select: {
        id: true,
        activeFrom: true,
        activeUntil: true,
        nextBoundaryAt: true,
        flagEnvironment: {
          select: {
            environmentId: true,
            flag: {
              select: { key: true, projectId: true, organizationId: true },
            },
          },
        },
      },
      orderBy: { nextBoundaryAt: 'asc' },
      take: RULE_SCHEDULE_BATCH_SIZE,
    })

    let announced = 0
    for (const rule of due) {
      try {
        const { count } = await this.prisma.targetingRule.updateMany({
          where: { id: rule.id, nextBoundaryAt: rule.nextBoundaryAt },
          data: { nextBoundaryAt: nextBoundaryAfter(rule, now) },
        })
        // Claimed by another instance (or the rule changed meanwhile)
        if (count !== 1) continue

        const { environmentId, flag } = rule.flagEnvironment
        await this.changes.recordChange({
          organizationId: flag.organizationId,
          projectId: flag.projectId,
          environmentIds: [environmentId],
          changes: [{ flagKey: flag.key, action: 'rules_changed' }],
        })
        announced++
      } catch (error) {
        this.logger.warn(
          `Rule scheduler: bound of rule ${rule.id} not announced: ${String(error)}`
        )
      }
    }
    return announced
  }
}
