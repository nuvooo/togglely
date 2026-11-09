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
    private readonly logger: BusLogger,
    /** Local fan-out; shared when wrapped by ResilientChangeBus */
    local?: InMemoryChangeBus
  ) {
    this.local = local ?? new InMemoryChangeBus(logger)
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

/** Returns a logger function that logs at most once per interval. */
function throttled(
  log: (message: string) => void,
  intervalMs: number
): (message: string) => void {
  let last = Number.NEGATIVE_INFINITY
  return (message) => {
    const now = Date.now()
    if (now - last < intervalMs) return
    last = now
    log(message)
  }
}

export interface ResilientBusOptions {
  initialDelayMs?: number
  maxDelayMs?: number
  /** Minimum time between repeated connection warnings */
  warnIntervalMs?: number
}

/**
 * Redis bus that survives Redis being unavailable: delivers in-memory
 * (this instance only) until Redis is reachable, retrying in the background
 * with exponential backoff (up to 60 s), then switches to Redis Pub/Sub.
 * Subscribers stay attached across the switch. After connecting, ioredis
 * reconnects (and re-subscribes) on its own.
 */
export class ResilientChangeBus implements ChangeBus {
  private readonly local: InMemoryChangeBus
  private redis: RedisChangeBus | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private delayMs: number
  private closed = false
  private readonly warn: (message: string) => void
  private readonly initialDelayMs: number
  private readonly maxDelayMs: number

  constructor(
    private readonly url: string,
    private readonly logger: BusLogger,
    private readonly redisFactory: RedisFactory,
    options: ResilientBusOptions = {}
  ) {
    this.local = new InMemoryChangeBus(logger)
    this.initialDelayMs = options.initialDelayMs ?? 1000
    this.maxDelayMs = options.maxDelayMs ?? 60_000
    this.delayMs = this.initialDelayMs
    this.warn = throttled(
      (message) => logger.warn(message),
      options.warnIntervalMs ?? 60_000
    )
  }

  get mode(): 'redis' | 'memory' {
    return this.redis ? 'redis' : 'memory'
  }

  /** First connection attempt; on failure retries in the background. */
  async start(): Promise<void> {
    const error = await this.tryConnect()
    if (error === null) return
    this.warn(
      `ChangeBus: Redis unavailable (${String(error)}), using in-memory delivery (this instance only) and retrying in the background`
    )
    this.scheduleRetry()
  }

  async publish(event: FlagsChangedEvent): Promise<void> {
    if (this.redis) {
      await this.redis.publish(event)
    } else {
      this.local.emitLocal(event)
    }
  }

  subscribe(handler: ChangeHandler): () => void {
    return this.local.subscribe(handler)
  }

  async close(): Promise<void> {
    this.closed = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    if (this.redis) await this.redis.close()
    else await this.local.close()
  }

  /** Returns null on success, otherwise the connection error. */
  private async tryConnect(): Promise<unknown> {
    const publisher = this.redisFactory(this.url)
    const subscriber = this.redisFactory(this.url)
    // Without listeners ioredis logs unhandled 'error' events; while
    // reconnecting it emits one per attempt
    for (const client of [publisher, subscriber]) {
      client.on('error', (error: unknown) =>
        this.warn(`ChangeBus Redis error: ${String(error)}`)
      )
    }
    try {
      await Promise.all([publisher.connect(), subscriber.connect()])
      const bus = new RedisChangeBus(
        publisher,
        subscriber,
        this.logger,
        this.local
      )
      await bus.start()
      if (this.closed) {
        await Promise.allSettled([publisher.quit(), subscriber.quit()])
        return null
      }
      this.redis = bus
      this.logger.log?.('ChangeBus: using Redis Pub/Sub')
      return null
    } catch (error) {
      publisher.disconnect()
      subscriber.disconnect()
      return error ?? new Error('unknown error')
    }
  }

  private scheduleRetry() {
    if (this.closed) return
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null
      if (this.closed) return
      const error = await this.tryConnect()
      if (error === null) return
      this.warn(`ChangeBus: Redis still unavailable: ${String(error)}`)
      this.delayMs = Math.min(this.delayMs * 2, this.maxDelayMs)
      this.scheduleRetry()
    }, this.delayMs)
    this.retryTimer.unref?.()
  }
}

/**
 * Without REDIS_URL the in-memory bus; with REDIS_URL a ResilientChangeBus
 * (Redis Pub/Sub, falling back to in-memory while Redis is unreachable).
 */
export async function createChangeBus(
  env: NodeJS.ProcessEnv,
  logger: BusLogger,
  redisFactory: RedisFactory = defaultRedisFactory
): Promise<ChangeBus> {
  const url = env.REDIS_URL?.trim()
  if (!url) return new InMemoryChangeBus(logger)

  const bus = new ResilientChangeBus(url, logger, redisFactory)
  await bus.start()
  return bus
}
