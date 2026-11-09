import { OnModuleDestroy } from '@nestjs/common'
import { ChangeBus } from '../change-events/change-bus'
import { FlagsChangedEvent } from '../change-events/change-events.types'
import { SDK_ERROR_CODES } from './sdk.constants'
import { SdkAccess } from './sdk.service'
import {
  extractSdkApiKey,
  extractSdkOrigin,
  mapSdkError,
  setSdkCorsHeaders,
} from './sdk-http.utils'

export interface SdkStreamOptions {
  /** Concurrent streams per SERVER/SDK API key */
  maxPerServerKey: number
  /** Concurrent streams per CLIENT API key (one per browser tab) */
  maxPerClientKey: number
  /** Concurrent streams per client IP using SERVER/SDK keys */
  maxPerServerIp: number
  /** Concurrent streams per client IP using CLIENT keys (NAT, offices) */
  maxPerClientIp: number
  heartbeatMs: number
  /** Interval for re-checking the API key / origin of open streams */
  revalidateMs: number
  /** Reconnect delay suggested to EventSource clients */
  retryMs: number
  /** Close a stream whose socket did not drain for this many heartbeats */
  maxMissedDrains: number
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function readSdkStreamOptions(env: NodeJS.ProcessEnv): SdkStreamOptions {
  return {
    // SSE_MAX_PER_KEY: older name, still honoured for server keys
    maxPerServerKey: positiveInt(
      env.SSE_MAX_PER_SERVER_KEY,
      positiveInt(env.SSE_MAX_PER_KEY, 50)
    ),
    maxPerClientKey: positiveInt(env.SSE_MAX_PER_CLIENT_KEY, 10_000),
    maxPerServerIp: positiveInt(env.SSE_MAX_PER_IP, 20),
    maxPerClientIp: positiveInt(env.SSE_MAX_PER_CLIENT_IP, 50),
    heartbeatMs: 25_000,
    revalidateMs: 5 * 60_000,
    retryMs: 5000,
    maxMissedDrains: 3,
  }
}

export interface SdkStreamDeps {
  sdkService: {
    resolveSdkAccess(
      projectKey: string,
      environmentKey: string,
      apiKey: string,
      origin?: string
    ): Promise<SdkAccess>
  }
  changeEvents: {
    getVersion(projectId: string, environmentId: string): Promise<number>
  }
  bus: ChangeBus
  logger: {
    debug(message: string): void
    warn(message: string): void
    error(message: string): void
  }
}

type KeyClass = 'client' | 'server'

interface StreamConnection {
  projectKey: string
  environmentKey: string
  apiKey: string
  origin?: string
  /** Counter keys */
  keySlot: string
  ipSlot: string
  projectId: string
  environmentId: string
  res: any
  /** Serializes revalidation + writes so events keep their order */
  queue: Promise<void>
  closed: boolean
  awaitingDrain: boolean
  missedDrains: number
}

/** 429 body: clients should degrade to conditional polling. */
export const STREAM_LIMIT_RESPONSE = {
  error: 'Too many open streams',
  code: 'STREAM_LIMIT',
  fallback: 'etag-polling',
  message:
    'Stream limit reached. Poll GET /sdk/flags/:projectKey/:environmentKey with If-None-Match (ETag) instead; unchanged flags cost only a 304.',
} as const

/**
 * Server-Sent Events for SDK clients: GET /sdk/stream/:projectKey/:environmentKey.
 * One ChangeBus subscription and one heartbeat / revalidation timer for all
 * streams of this instance; events are routed to the streams of the
 * matching (project, environment).
 */
export class SdkStreamHub implements OnModuleDestroy {
  private readonly connections = new Set<StreamConnection>()
  private readonly perKey = new Map<string, number>()
  private readonly perIp = new Map<string, number>()
  private unsubscribe: (() => void) | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private revalidateTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly deps: SdkStreamDeps,
    private readonly options: SdkStreamOptions
  ) {}

  /**
   * Open stream counts (for tests and diagnostics). Keys are
   * `<client|server>:<apiKeyId>` and `<client|server>:<ip>`.
   */
  counts(): {
    total: number
    perKey: Record<string, number>
    perIp: Record<string, number>
  } {
    return {
      total: this.connections.size,
      perKey: Object.fromEntries(this.perKey),
      perIp: Object.fromEntries(this.perIp),
    }
  }

  async handle(req: any, res: any): Promise<void> {
    const { projectKey, environmentKey } = req.params
    const apiKey = extractSdkApiKey(req)
    const origin = extractSdkOrigin(req)
    const ip: string = req.ip ?? 'unknown'

    setSdkCorsHeaders(res, origin)

    if (!apiKey) {
      res.status(401).json({
        error: 'API key required',
        code: SDK_ERROR_CODES.missingApiKey,
      })
      return
    }

    // Registered before the first await: a client that disconnects while we
    // authenticate must never leave a reserved slot behind. The response's
    // 'close' fires on connection loss (the request's may already have fired
    // once its empty body was read).
    let aborted = false
    let connection: StreamConnection | undefined
    const onClose = () => {
      aborted = true
      if (connection) this.release(connection)
    }
    res.on('close', onClose)
    const gone = () =>
      aborted || !!res.destroyed || !!req.destroyed || !!req.socket?.destroyed

    let access: SdkAccess
    try {
      access = await this.deps.sdkService.resolveSdkAccess(
        projectKey,
        environmentKey,
        apiKey,
        origin
      )
    } catch (error: any) {
      if (gone()) return
      const response = mapSdkError(error)
      res.status(response.status).json(response.body)
      return
    }
    // Nothing reserved yet
    if (gone()) return

    const keyClass: KeyClass =
      access.apiKeyType === 'CLIENT' ? 'client' : 'server'
    const keySlot = `${keyClass}:${access.apiKeyId}`
    const ipSlot = `${keyClass}:${ip}`
    const maxPerKey =
      keyClass === 'client'
        ? this.options.maxPerClientKey
        : this.options.maxPerServerKey
    const maxPerIp =
      keyClass === 'client'
        ? this.options.maxPerClientIp
        : this.options.maxPerServerIp

    // Check and reserve synchronously: no await between check and increment
    if (
      (this.perKey.get(keySlot) ?? 0) >= maxPerKey ||
      (this.perIp.get(ipSlot) ?? 0) >= maxPerIp
    ) {
      res.setHeader('Retry-After', '60')
      res.status(429).json(STREAM_LIMIT_RESPONSE)
      return
    }
    increment(this.perKey, keySlot)
    increment(this.perIp, ipSlot)
    connection = {
      projectKey,
      environmentKey,
      apiKey,
      origin,
      keySlot,
      ipSlot,
      projectId: access.project.id,
      environmentId: access.environment.id,
      res,
      queue: Promise.resolve(),
      closed: false,
      awaitingDrain: false,
      missedDrains: 0,
    }

    let version: number
    try {
      version = await this.deps.changeEvents.getVersion(
        connection.projectId,
        connection.environmentId
      )
    } catch (error) {
      this.deps.logger.error(
        `[SDK stream] Version lookup failed: ${String(error)}`
      )
      this.release(connection)
      if (!gone()) {
        const response = mapSdkError(error as any)
        res.status(response.status).json(response.body)
      }
      return
    }
    if (gone() || connection.closed) {
      this.release(connection)
      return
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    // nginx: do not buffer the stream
    res.setHeader('X-Accel-Buffering', 'no')
    req.socket?.setTimeout?.(0)
    req.socket?.setNoDelay?.(true)
    res.flushHeaders()

    // The ready event carries the version as id, so a reconnecting
    // EventSource sends it back as Last-Event-ID and missed changes are
    // detected even if no event was received in between.
    this.write(connection, `retry: ${this.options.retryMs}\n\n`)
    this.writeEvent(connection, 'ready', version, { version })

    const lastEventId = Number.parseInt(
      String(req.headers?.['last-event-id'] ?? ''),
      10
    )
    if (Number.isInteger(lastEventId) && lastEventId !== version) {
      this.writeEvent(connection, 'flags-changed', version, {
        version,
        changes: [],
      })
    }

    this.connections.add(connection)
    this.start()
  }

  /** Ends all streams, stops timers and drops the bus subscription. */
  async close(): Promise<void> {
    for (const connection of [...this.connections]) this.release(connection)
    this.stop()
  }

  /** Nest shutdown hook: runs before the HTTP server is closed. */
  async onModuleDestroy(): Promise<void> {
    await this.close()
  }

  private start() {
    if (!this.unsubscribe) {
      this.unsubscribe = this.deps.bus.subscribe((event) =>
        this.dispatch(event)
      )
    }
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(
        () => this.heartbeat(),
        this.options.heartbeatMs
      )
      this.heartbeatTimer.unref?.()
    }
    if (!this.revalidateTimer) {
      this.revalidateTimer = setInterval(
        () => this.revalidateAll(),
        this.options.revalidateMs
      )
      this.revalidateTimer.unref?.()
    }
  }

  private stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.revalidateTimer) clearInterval(this.revalidateTimer)
    this.heartbeatTimer = null
    this.revalidateTimer = null
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /** Idempotent: frees the slots and ends the response if it is open. */
  private release(connection: StreamConnection) {
    if (connection.closed) return
    connection.closed = true
    this.connections.delete(connection)
    decrement(this.perKey, connection.keySlot)
    decrement(this.perIp, connection.ipSlot)
    const res = connection.res
    if (res.headersSent && !res.writableEnded && !res.destroyed) res.end()
    if (this.connections.size === 0) this.stop()
  }

  private heartbeat() {
    for (const connection of [...this.connections]) {
      if (connection.res.destroyed || connection.res.writableEnded) {
        this.release(connection)
        continue
      }
      // Slow consumer: the socket has not drained since the last writes
      if (connection.awaitingDrain) {
        connection.missedDrains++
        if (connection.missedDrains >= this.options.maxMissedDrains) {
          this.deps.logger.debug('[SDK stream] Closing stalled stream')
          this.release(connection)
        }
        continue
      }
      this.write(connection, ': heartbeat\n\n')
    }
  }

  private write(connection: StreamConnection, chunk: string) {
    const res = connection.res
    if (connection.closed || res.destroyed || res.writableEnded) return
    const flushed = res.write(chunk)
    if (!flushed && !connection.awaitingDrain) {
      connection.awaitingDrain = true
      res.once('drain', () => {
        connection.awaitingDrain = false
        connection.missedDrains = 0
      })
    }
  }

  private writeEvent(
    connection: StreamConnection,
    event: string,
    id: number,
    data: unknown
  ) {
    this.write(
      connection,
      `event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`
    )
  }

  private revalidateAll() {
    // Streams sharing key/origin/project/environment: one lookup per round
    const lookups = new Map<string, Promise<SdkAccess>>()
    for (const connection of this.connections) {
      connection.queue = connection.queue.then(async () => {
        await this.revalidate(connection, lookups)
      })
    }
  }

  private dispatch(event: FlagsChangedEvent) {
    // Streams sharing key/origin are revalidated with one lookup per event
    const lookups = new Map<string, Promise<SdkAccess>>()
    for (const connection of this.connections) {
      if (
        connection.projectId !== event.projectId ||
        connection.environmentId !== event.environmentId
      ) {
        continue
      }
      connection.queue = connection.queue.then(async () => {
        if (!(await this.revalidate(connection, lookups))) return
        this.writeEvent(connection, 'flags-changed', event.version, {
          version: event.version,
          changes: event.changes,
          ...(event.truncated && { truncated: true }),
        })
      })
    }
  }

  /**
   * Re-checks key, project, environment and origin. Closes the stream when
   * access was revoked; transient errors keep it open.
   */
  private async revalidate(
    connection: StreamConnection,
    lookups: Map<string, Promise<SdkAccess>>
  ): Promise<boolean> {
    if (connection.closed) return false
    try {
      const lookupKey = JSON.stringify([
        connection.projectKey,
        connection.environmentKey,
        connection.apiKey,
        connection.origin ?? '',
      ])
      let lookup = lookups.get(lookupKey)
      if (!lookup) {
        lookup = this.deps.sdkService.resolveSdkAccess(
          connection.projectKey,
          connection.environmentKey,
          connection.apiKey,
          connection.origin
        )
        // Avoid unhandled rejections for entries awaited later
        lookup.catch(() => {})
        lookups.set(lookupKey, lookup)
      }
      const access = await lookup
      if (connection.closed) return false
      // Environment deleted and re-created under the same key: the client
      // must reconnect to follow the new environment
      if (access.environment.id !== connection.environmentId) {
        this.release(connection)
        return false
      }
      return true
    } catch (error: any) {
      if (connection.closed) return false
      if (mapSdkError(error).status === 500) {
        this.deps.logger.warn(
          `[SDK stream] Revalidation failed, keeping stream open: ${String(error?.message ?? error)}`
        )
        return true
      }
      this.deps.logger.debug('[SDK stream] Access revoked, closing stream')
      this.release(connection)
      return false
    }
  }
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function decrement(map: Map<string, number>, key: string) {
  const next = (map.get(key) ?? 0) - 1
  if (next > 0) map.set(key, next)
  else map.delete(key)
}
