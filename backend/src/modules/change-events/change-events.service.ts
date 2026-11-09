import { randomUUID } from 'crypto'
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'
import { CHANGE_BUS, ChangeBus } from './change-bus'
import {
  FlagChange,
  FlagsChangedEvent,
  RecordChangeInput,
} from './change-events.types'

/** Changes per (project, environment) are collected this long. */
export const CHANGE_DEBOUNCE_MS = 2000
/** Max changes listed in one event; more sets `truncated: true`. */
export const MAX_EVENT_CHANGES = 100

interface PendingChanges {
  organizationId: string
  projectId: string
  environmentId: string
  environmentKey?: string
  /** dedupe key → change, in insertion order */
  changes: Map<string, FlagChange>
  /** Last version seen at record time (fallback if the re-read fails) */
  version: number
  timer: ReturnType<typeof setTimeout>
}

/**
 * Tracks configuration versions per (project, environment) and publishes
 * debounced `flags.changed` events on the ChangeBus. Recording is
 * best-effort: it never fails the mutation that triggered it.
 */
@Injectable()
export class ChangeEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(ChangeEventsService.name)
  private readonly pending = new Map<string, PendingChanges>()

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANGE_BUS) private readonly bus: ChangeBus
  ) {}

  /**
   * Call AFTER a successful mutation that can change SDK results. Never
   * throws.
   */
  async recordChange(input: RecordChangeInput): Promise<void> {
    try {
      const environmentIds =
        input.environmentIds === 'all'
          ? (
              await this.prisma.environment.findMany({
                where: { projectId: input.projectId },
                select: { id: true },
              })
            ).map((env) => env.id)
          : [...new Set(input.environmentIds)]

      for (const environmentId of environmentIds) {
        const version = await this.incrementVersion(
          input.projectId,
          environmentId
        )
        this.buffer(input, environmentId, version)
      }
    } catch (error) {
      this.logger.error(
        `Failed to record change for project ${input.projectId}: ${String(error)}`
      )
    }
  }

  /** Current configuration version; 0 if nothing was ever recorded. */
  async getVersion(projectId: string, environmentId: string): Promise<number> {
    const row = await this.prisma.configVersion.findUnique({
      where: { projectId_environmentId: { projectId, environmentId } },
      select: { version: true },
    })
    return row?.version ?? 0
  }

  async onModuleDestroy(): Promise<void> {
    await this.flushAll()
    await this.bus.close?.()
  }

  /** Publishes all pending events immediately. */
  async flushAll(): Promise<void> {
    await Promise.all([...this.pending.keys()].map((key) => this.flush(key)))
  }

  /** Returns the new version, or 0 if the increment failed. */
  private async incrementVersion(
    projectId: string,
    environmentId: string
  ): Promise<number> {
    const upsert = () =>
      this.prisma.configVersion.upsert({
        where: { projectId_environmentId: { projectId, environmentId } },
        create: { projectId, environmentId, version: 1 },
        update: { version: { increment: 1 } },
      })
    try {
      try {
        return (await upsert()).version
      } catch (error: any) {
        // Two concurrent first upserts race on the unique index: retry once
        if (error?.code !== 'P2002') throw error
        return (await upsert()).version
      }
    } catch (error) {
      this.logger.error(
        `Failed to increment config version (${projectId}/${environmentId}): ${String(error)}`
      )
      return 0
    }
  }

  private buffer(
    input: RecordChangeInput,
    environmentId: string,
    version: number
  ) {
    const key = `${input.projectId}:${environmentId}`
    let entry = this.pending.get(key)
    if (!entry) {
      // Fixed window from the first change: bounded latency even under a
      // constant stream of changes
      const timer = setTimeout(() => {
        void this.flush(key)
      }, CHANGE_DEBOUNCE_MS)
      timer.unref?.()
      entry = {
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId,
        changes: new Map(),
        version,
        timer,
      }
      this.pending.set(key, entry)
    }
    entry.version = Math.max(entry.version, version)
    const fallbackKey = input.environmentKeys?.[environmentId]
    if (fallbackKey) entry.environmentKey = fallbackKey

    for (const change of input.changes) {
      const dedupeKey = `${change.flagKey ?? ''}\u0000${change.action}`
      if (!entry.changes.has(dedupeKey)) {
        entry.changes.set(dedupeKey, {
          ...(change.flagKey !== undefined && { flagKey: change.flagKey }),
          action: change.action,
        })
      }
    }
  }

  private async flush(key: string): Promise<void> {
    const entry = this.pending.get(key)
    if (!entry) return
    this.pending.delete(key)
    clearTimeout(entry.timer)

    try {
      const [project, environment, version] = await Promise.all([
        this.prisma.project.findUnique({
          where: { id: entry.projectId },
          select: { key: true },
        }),
        this.prisma.environment.findUnique({
          where: { id: entry.environmentId },
          select: { key: true },
        }),
        this.getVersion(entry.projectId, entry.environmentId).catch(
          () => entry.version
        ),
      ])

      if (!project) {
        // Project deleted in the meantime: nobody can consume the event
        this.logger.debug(
          `Dropping change event for deleted project ${entry.projectId}`
        )
        return
      }

      const changes = [...entry.changes.values()]
      const event: FlagsChangedEvent = {
        eventId: randomUUID(),
        organizationId: entry.organizationId,
        projectId: entry.projectId,
        projectKey: project.key,
        environmentId: entry.environmentId,
        environmentKey: environment?.key ?? entry.environmentKey ?? '',
        version: Math.max(version, entry.version),
        changes: changes.slice(0, MAX_EVENT_CHANGES),
        ...(changes.length > MAX_EVENT_CHANGES && { truncated: true }),
        createdAt: new Date().toISOString(),
      }
      await this.bus.publish(event)
    } catch (error) {
      this.logger.error(
        `Failed to publish change event for ${key}: ${String(error)}`
      )
    }
  }
}
