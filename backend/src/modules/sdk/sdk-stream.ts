import { ChangeBus } from '../change-events/change-bus'
import { FlagsChangedEvent } from '../change-events/change-events.types'
import { SDK_ERROR_CODES } from './sdk.constants'
import {
  extractSdkApiKey,
  extractSdkOrigin,
  mapSdkError,
  setSdkCorsHeaders,
} from './sdk-http.utils'
import { SdkAccess } from './sdk.service'

export interface SdkStreamOptions {
  /** Concurrent streams per API key */
  maxPerKey: number
  /** Concurrent streams per client IP */
  maxPerIp: number
  heartbeatMs: number
  /** Interval for re-checking the API key / origin of open streams */
  revalidateMs: number
  /** Reconnect delay suggested to EventSource clients */
  retryMs: number
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function readSdkStreamOptions(
  env: NodeJS.ProcessEnv
): SdkStreamOptions {
  return {
    maxPerKey: positiveInt(env.SSE_MAX_PER_KEY, 50),
    maxPerIp: positiveInt(env.SSE_MAX_PER_IP, 20),
    heartbeatMs: 25_000,
    revalidateMs: 5 * 60_000,
    retryMs: 5000,
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

interface StreamConnection {
  projectKey: string
  environmentKey: string
  apiKey: string
  origin?: string
  apiKeyId: string
  ip: string
  projectId: string
  environmentId: string
  res: any
  /** Serializes revalidation + writes so events keep their order */
  queue: Promise<void>
  close: () => void
}

/**
 * Server-Sent Events for SDK clients: GET /sdk/stream/:projectKey/:environmentKey.
 * One ChangeBus subscription for all streams of this instance; events are
 * routed to the streams of the matching (project, environment).
 */
export class SdkStreamHub {
  private readonly connections = new Set<StreamConnection>()
  private readonly perKey = new Map<string, number>()
  private readonly perIp = new Map<string, number>()
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly deps: SdkStreamDeps,
    private readonly options: SdkStreamOptions
  ) {}

  /** Open stream counts (for tests and diagnostics). */
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

    let access: SdkAccess
    try {
      access = await this.deps.sdkService.resolveSdkAccess(
        projectKey,
        environmentKey,
        apiKey,
        origin
      )
    } catch (error: any) {
      const response = mapSdkError(error)
      res.status(response.status).json(response.body)
      return
    }

    // Check and reserve synchronously: no await between check and increment
    if (
      (this.perKey.get(access.apiKeyId) ?? 0) >= this.options.maxPerKey ||
      (this.perIp.get(ip) ?? 0) >= this.options.maxPerIp
    ) {
      res.status(429).json({
        error: 'Too many open streams',
        code: 'STREAM_LIMIT',
      })
      return
    }
    increment(this.perKey, access.apiKeyId)
    increment(this.perIp, ip)

    let closed = false
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let revalidate: ReturnType<typeof setInterval> | undefined
    const connection: StreamConnection = {
      projectKey,
      environmentKey,
      apiKey,
      origin,
      apiKeyId: access.apiKeyId,
      ip,
      projectId: access.project.id,
      environmentId: access.environment.id,
      res,
      queue: Promise.resolve(),
      close: () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        if (revalidate) clearInterval(revalidate)
        this.connections.delete(connection)
        decrement(this.perKey, connection.apiKeyId)
        decrement(this.perIp, ip)
        if (!res.writableEnded) res.end()
      },
    }
    req.on('close', connection.close)

    let version: number
    try {
      version = await this.deps.changeEvents.getVersion(
        connection.projectId,
        connection.environmentId
      )
    } catch (error) {
      this.deps.logger.error(`[SDK stream] Version lookup failed: ${String(error)}`)
      if (!closed) {
        closed = true
        decrement(this.perKey, connection.apiKeyId)
        decrement(this.perIp, ip)
        const response = mapSdkError(error as any)
        res.status(response.status).json(response.body)
      }
      return
    }
    // Client went away while we were looking up the version
    if (closed) return

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
    res.write(`retry: ${this.options.retryMs}\n\n`)
    writeEvent(res, 'ready', version, { version })

    const lastEventId = Number.parseInt(
      String(req.headers?.['last-event-id'] ?? ''),
      10
    )
    if (Number.isInteger(lastEventId) && lastEventId !== version) {
      writeEvent(res, 'flags-changed', version, { version, changes: [] })
    }

    this.connections.add(connection)
    this.ensureSubscribed()

    heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n')
    }, this.options.heartbeatMs)
    heartbeat.unref?.()

    revalidate = setInterval(() => {
      connection.queue = connection.queue.then(async () => {
        await this.revalidate(connection)
      })
    }, this.options.revalidateMs)
    revalidate.unref?.()
  }

  /** Ends all streams and drops the bus subscription. */
  async close(): Promise<void> {
    for (const connection of [...this.connections]) connection.close()
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private ensureSubscribed() {
    if (this.unsubscribe) return
    this.unsubscribe = this.deps.bus.subscribe((event) => this.dispatch(event))
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
        if (connection.res.writableEnded) return
        writeEvent(connection.res, 'flags-changed', event.version, {
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
    lookups?: Map<string, Promise<SdkAccess>>
  ): Promise<boolean> {
    if (!this.connections.has(connection)) return false
    try {
      const lookupKey = JSON.stringify([
        connection.projectKey,
        connection.environmentKey,
        connection.apiKey,
        connection.origin ?? '',
      ])
      let lookup = lookups?.get(lookupKey)
      if (!lookup) {
        lookup = this.deps.sdkService.resolveSdkAccess(
          connection.projectKey,
          connection.environmentKey,
          connection.apiKey,
          connection.origin
        )
        // Avoid unhandled rejections for entries awaited later
        lookup.catch(() => {})
        lookups?.set(lookupKey, lookup)
      }
      const access = await lookup
      // Environment deleted and re-created under the same key: the client
      // must reconnect to follow the new environment
      if (access.environment.id !== connection.environmentId) {
        connection.close()
        return false
      }
      return true
    } catch (error: any) {
      if (mapSdkError(error).status === 500) {
        this.deps.logger.warn(
          `[SDK stream] Revalidation failed, keeping stream open: ${String(error?.message ?? error)}`
        )
        return true
      }
      this.deps.logger.debug('[SDK stream] Access revoked, closing stream')
      connection.close()
      return false
    }
  }
}

function writeEvent(res: any, event: string, id: number, data: unknown) {
  res.write(`event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`)
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function decrement(map: Map<string, number>, key: string) {
  const next = (map.get(key) ?? 0) - 1
  if (next > 0) map.set(key, next)
  else map.delete(key)
}
