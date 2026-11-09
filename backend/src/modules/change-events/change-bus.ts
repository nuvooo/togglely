import { EventEmitter } from 'node:events'
import Redis from 'ioredis'
import { FlagsChangedEvent } from './change-events.types'

/** DI token for the ChangeBus implementation. */
export const CHANGE_BUS = 'CHANGE_BUS'

/** Redis Pub/Sub channel shared by all instances. */
export const CHANGE_BUS_CHANNEL = 'togglely:flags-changed'

export type ChangeHandler = (event: FlagsChangedEvent) => void

/**
 * Distributes debounced change events to local consumers (SDK stream hub,
 * webhook dispatcher). With Redis every instance receives every event.
 */
export interface ChangeBus {
  publish(event: FlagsChangedEvent): Promise<void>
  /** Returns an unsubscribe function. */
  subscribe(handler: ChangeHandler): () => void
  close?(): Promise<void>
}

export interface BusLogger {
  warn(message: string): void
  error(message: string): void
  log?(message: string): void
}

const EVENT_NAME = 'flags-changed'

/** Default single-instance bus. */
export class InMemoryChangeBus implements ChangeBus {
  private readonly emitter = new EventEmitter()

  constructor(private readonly logger?: BusLogger) {
    // One listener per open SDK stream
    this.emitter.setMaxListeners(0)
  }

  async publish(event: FlagsChangedEvent): Promise<void> {
    this.emitLocal(event)
  }

  subscribe(handler: ChangeHandler): () => void {
    // Wrap so a throwing consumer never breaks delivery to the others
    const listener = (event: FlagsChangedEvent) => {
      try {
        handler(event)
      } catch (error) {
        this.logger?.error(`ChangeBus subscriber failed: ${String(error)}`)
      }
    }
    this.emitter.on(EVENT_NAME, listener)
    return () => {
      this.emitter.off(EVENT_NAME, listener)
    }
  }

  /** Synchronously delivers an event to local subscribers only. */
  emitLocal(event: FlagsChangedEvent): void {
    this.emitter.emit(EVENT_NAME, event)
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners()
  }
}

/** The subset of ioredis used by the bus (mockable in tests). */
export interface RedisLike {
  connect(): Promise<unknown>
  publish(channel: string, message: string): Promise<unknown>
  subscribe(channel: string): Promise<unknown>
  on(event: string, listener: (...args: any[]) => void): unknown
  quit(): Promise<unknown>
  disconnect(): void
}

function isFlagsChangedEvent(value: unknown): value is FlagsChangedEvent {
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  return (
    typeof e.eventId === 'string' &&
    typeof e.projectId === 'string' &&
    typeof e.environmentId === 'string' &&
    typeof e.version === 'number' &&
    Array.isArray(e.changes)
  )
}

/**
 * Redis Pub/Sub bus for multiple instances. Needs two connections: a
 * subscribed ioredis connection cannot publish.
 */
export class RedisChangeBus implements ChangeBus {
  private readonly local: InMemoryChangeBus

  constructor(
    private readonly publisher: RedisLike,
    private readonly subscriber: RedisLike,
    private readonly logger: BusLogger
  ) {
    this.local = new InMemoryChangeBus(logger)
  }

  async start(): Promise<void> {
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel !== CHANGE_BUS_CHANNEL) return
      let parsed: unknown
      try {
        parsed = JSON.parse(message)
      } catch {
        this.logger.warn('ChangeBus: ignoring malformed Redis message')
        return
      }
      if (!isFlagsChangedEvent(parsed)) {
        this.logger.warn('ChangeBus: ignoring unexpected Redis message')
        return
      }
      this.local.emitLocal(parsed)
    })
    await this.subscriber.subscribe(CHANGE_BUS_CHANNEL)
  }

  async publish(event: FlagsChangedEvent): Promise<void> {
    try {
      await this.publisher.publish(CHANGE_BUS_CHANNEL, JSON.stringify(event))
    } catch (error) {
      // At least this instance's consumers still get the event
      this.logger.warn(
        `ChangeBus: Redis publish failed, delivering locally only: ${String(error)}`
      )
      this.local.emitLocal(event)
    }
  }

  subscribe(handler: ChangeHandler): () => void {
    return this.local.subscribe(handler)
  }

  async close(): Promise<void> {
    await this.local.close()
    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()])
  }
}

export type RedisFactory = (url: string) => RedisLike

const defaultRedisFactory: RedisFactory = (url) =>
  new Redis(url, {
    lazyConnect: true,
    // Fail fast on the initial connect so the fallback kicks in
    maxRetriesPerRequest: 1,
  }) as unknown as RedisLike

/**
 * Redis bus when REDIS_URL is set, otherwise (or when Redis is unreachable at
 * startup) the in-memory bus.
 */
export async function createChangeBus(
  env: NodeJS.ProcessEnv,
  logger: BusLogger,
  redisFactory: RedisFactory = defaultRedisFactory
): Promise<ChangeBus> {
  const url = env.REDIS_URL?.trim()
  if (!url) return new InMemoryChangeBus(logger)

  const publisher = redisFactory(url)
  const subscriber = redisFactory(url)
  // Without listeners ioredis logs unhandled 'error' events
  for (const client of [publisher, subscriber]) {
    client.on('error', (error: unknown) =>
      logger.warn(`ChangeBus Redis error: ${String(error)}`)
    )
  }

  try {
    await Promise.all([publisher.connect(), subscriber.connect()])
    const bus = new RedisChangeBus(publisher, subscriber, logger)
    await bus.start()
    logger.log?.('ChangeBus: using Redis Pub/Sub')
    return bus
  } catch (error) {
    logger.warn(
      `ChangeBus: Redis unavailable (${String(error)}), falling back to in-memory (single instance only)`
    )
    publisher.disconnect()
    subscriber.disconnect()
    return new InMemoryChangeBus(logger)
  }
}
