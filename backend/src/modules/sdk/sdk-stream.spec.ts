import { EventEmitter } from 'node:events'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { InMemoryChangeBus } from '../change-events/change-bus'
import { FlagsChangedEvent } from '../change-events/change-events.types'
import {
  readSdkStreamOptions,
  SdkStreamHub,
  SdkStreamOptions,
} from './sdk-stream'

const access = (envId = 'e1', keyId = 'key-1', apiKeyType = 'SERVER') => ({
  organizationId: 'org',
  apiKeyId: keyId,
  apiKeyType,
  project: { id: 'p1', key: 'shop' },
  environment: { id: envId, key: 'dev' },
})

function createReq(
  options: {
    apiKey?: string
    ip?: string
    headers?: Record<string, string>
  } = {}
) {
  const req: any = new EventEmitter()
  req.params = { projectKey: 'shop', environmentKey: 'dev' }
  req.query =
    options.apiKey === undefined
      ? { apiKey: 'k' }
      : options.apiKey
        ? { apiKey: options.apiKey }
        : {}
  req.headers = options.headers ?? {}
  req.ip = options.ip ?? '1.1.1.1'
  req.socket = {
    setTimeout: jest.fn(),
    setNoDelay: jest.fn(),
    destroyed: false,
  }
  return req
}

function createRes() {
  const res: any = new EventEmitter()
  res.headers = {} as Record<string, string>
  res.statusCode = 200
  res.chunks = [] as string[]
  res.body = undefined
  res.writableEnded = false
  res.destroyed = false
  res.headersSent = false
  res.writeReturns = true
  res.setHeader = jest.fn((k: string, v: string) => {
    res.headers[k.toLowerCase()] = v
  })
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = jest.fn((body: unknown) => {
    res.body = body
    res.headersSent = true
    res.writableEnded = true
    return res
  })
  res.flushHeaders = jest.fn(() => {
    res.headersSent = true
  })
  res.write = jest.fn((chunk: string) => {
    res.chunks.push(chunk)
    return res.writeReturns
  })
  res.end = jest.fn(() => {
    res.writableEnded = true
  })
  /** Simulates the client going away (socket closed). */
  res.disconnect = () => {
    res.destroyed = true
    res.emit('close')
  }
  res.text = () => res.chunks.join('')
  return res
}

const changeEvent = (
  overrides: Partial<FlagsChangedEvent> = {}
): FlagsChangedEvent => ({
  eventId: 'evt',
  organizationId: 'org',
  projectId: 'p1',
  projectKey: 'shop',
  environmentId: 'e1',
  environmentKey: 'dev',
  version: 6,
  changes: [{ flagKey: 'a', action: 'toggled' }],
  createdAt: new Date().toISOString(),
  ...overrides,
})

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('readSdkStreamOptions', () => {
  it('has separate defaults for client and server keys', () => {
    expect(readSdkStreamOptions({})).toMatchObject({
      maxPerServerKey: 50,
      maxPerClientKey: 10_000,
      maxPerServerIp: 20,
      maxPerClientIp: 50,
      heartbeatMs: 25_000,
      revalidateMs: 300_000,
      retryMs: 5000,
      maxMissedDrains: 3,
    })
  })

  it('reads the env vars, with SSE_MAX_PER_KEY as fallback for server keys', () => {
    expect(
      readSdkStreamOptions({
        SSE_MAX_PER_SERVER_KEY: '3',
        SSE_MAX_PER_CLIENT_KEY: '4',
        SSE_MAX_PER_IP: '2',
        SSE_MAX_PER_CLIENT_IP: '5',
      })
    ).toMatchObject({
      maxPerServerKey: 3,
      maxPerClientKey: 4,
      maxPerServerIp: 2,
      maxPerClientIp: 5,
    })
    expect(readSdkStreamOptions({ SSE_MAX_PER_KEY: '7' }).maxPerServerKey).toBe(
      7
    )
  })
})

describe('SdkStreamHub', () => {
  let bus: InMemoryChangeBus
  let sdkService: { resolveSdkAccess: jest.Mock }
  let changeEvents: { getVersion: jest.Mock }
  let hub: SdkStreamHub

  function createHub(options: Partial<SdkStreamOptions> = {}) {
    hub = new SdkStreamHub(
      {
        sdkService,
        changeEvents,
        bus,
        logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
      },
      { ...readSdkStreamOptions({}), ...options }
    )
    return hub
  }

  beforeEach(() => {
    jest.useFakeTimers()
    bus = new InMemoryChangeBus()
    sdkService = { resolveSdkAccess: jest.fn().mockResolvedValue(access()) }
    changeEvents = { getVersion: jest.fn().mockResolvedValue(5) }
    createHub()
  })

  afterEach(async () => {
    await hub.close()
    jest.useRealTimers()
  })

  it('opens an event stream with retry and a ready event', async () => {
    const res = createRes()
    await hub.handle(createReq(), res)

    expect(sdkService.resolveSdkAccess).toHaveBeenCalledWith(
      'shop',
      'dev',
      'k',
      undefined
    )
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')
    expect(res.headers['cache-control']).toContain('no-cache')
    expect(res.headers['x-accel-buffering']).toBe('no')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.flushHeaders).toHaveBeenCalled()
    expect(res.text()).toBe(
      'retry: 5000\n\nevent: ready\nid: 5\ndata: {"version":5}\n\n'
    )
    expect(hub.counts()).toEqual({
      total: 1,
      perKey: { 'server:key-1': 1 },
      perIp: { 'server:1.1.1.1': 1 },
    })
  })

  it('rejects requests without an API key', async () => {
    const res = createRes()
    await hub.handle(createReq({ apiKey: '' }), res)
    expect(res.statusCode).toBe(401)
    expect(hub.counts().total).toBe(0)
  })

  it('maps auth errors like the other SDK routes', async () => {
    sdkService.resolveSdkAccess.mockRejectedValue(
      new UnauthorizedException('Invalid API key')
    )
    const res = createRes()
    await hub.handle(createReq(), res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ code: 'INVALID_API_KEY' })
    expect(res.write).not.toHaveBeenCalled()
  })

  it('forwards matching change events with the version as id', async () => {
    const res = createRes()
    await hub.handle(createReq(), res)
    res.chunks.length = 0

    await bus.publish(changeEvent())
    await settle()

    expect(res.text()).toBe(
      'event: flags-changed\nid: 6\ndata: {"version":6,"changes":[{"flagKey":"a","action":"toggled"}]}\n\n'
    )
  })

  it('ignores events of other environments and projects', async () => {
    const res = createRes()
    await hub.handle(createReq(), res)
    res.chunks.length = 0

    await bus.publish(changeEvent({ environmentId: 'e2' }))
    await bus.publish(changeEvent({ projectId: 'p2' }))
    await settle()

    expect(res.chunks).toEqual([])
  })

  it('sends a heartbeat comment every 25 s', async () => {
    const res = createRes()
    await hub.handle(createReq(), res)
    res.chunks.length = 0

    jest.advanceTimersByTime(25_000)
    expect(res.text()).toBe(': heartbeat\n\n')
  })

  it('sends a catch-up event when Last-Event-ID differs', async () => {
    const res = createRes()
    await hub.handle(createReq({ headers: { 'last-event-id': '3' } }), res)

    expect(res.text()).toContain(
      'event: flags-changed\nid: 5\ndata: {"version":5,"changes":[]}\n\n'
    )
  })

  it('does not send a catch-up event when Last-Event-ID is current', async () => {
    const res = createRes()
    await hub.handle(createReq({ headers: { 'last-event-id': '5' } }), res)
    expect(res.text()).not.toContain('flags-changed')
  })

  describe('limits', () => {
    it('enforces the per-key limit for server keys with 429 and an ETag fallback hint', async () => {
      createHub({ maxPerServerKey: 2, maxPerServerIp: 100 })
      await hub.handle(createReq({ ip: '1.0.0.1' }), createRes())
      await hub.handle(createReq({ ip: '1.0.0.2' }), createRes())
      const res = createRes()
      await hub.handle(createReq({ ip: '1.0.0.3' }), res)

      expect(res.statusCode).toBe(429)
      expect(res.body).toMatchObject({
        code: 'STREAM_LIMIT',
        fallback: 'etag-polling',
      })
      expect(res.body.message).toMatch(/If-None-Match/)
      expect(res.headers['retry-after']).toBe('60')
      expect(hub.counts().total).toBe(2)
    })

    it('enforces the per-IP limit for server keys', async () => {
      createHub({ maxPerServerKey: 100, maxPerServerIp: 1 })
      sdkService.resolveSdkAccess
        .mockResolvedValueOnce(access('e1', 'key-a'))
        .mockResolvedValueOnce(access('e1', 'key-b'))
      await hub.handle(createReq(), createRes())
      const res = createRes()
      await hub.handle(createReq(), res)

      expect(res.statusCode).toBe(429)
    })

    it('uses the client limits for CLIENT keys', async () => {
      createHub({
        maxPerServerKey: 1,
        maxPerServerIp: 1,
        maxPerClientKey: 3,
        maxPerClientIp: 2,
      })
      sdkService.resolveSdkAccess.mockResolvedValue(
        access('e1', 'browser-key', 'CLIENT')
      )
      const statuses: number[] = []
      for (const ip of [
        '1.0.0.1',
        '1.0.0.1',
        '1.0.0.1',
        '1.0.0.2',
        '1.0.0.3',
      ]) {
        const res = createRes()
        await hub.handle(createReq({ ip }), res)
        statuses.push(res.statusCode)
      }

      // 2 per IP, 3 per key
      expect(statuses).toEqual([200, 200, 429, 200, 429])
      expect(hub.counts().perKey).toEqual({ 'client:browser-key': 3 })
    })

    it('counts client and server keys from one IP separately', async () => {
      createHub({ maxPerServerIp: 1, maxPerClientIp: 1 })
      sdkService.resolveSdkAccess
        .mockResolvedValueOnce(access('e1', 'srv', 'SERVER'))
        .mockResolvedValueOnce(access('e1', 'cli', 'CLIENT'))
      const a = createRes()
      const b = createRes()
      await hub.handle(createReq(), a)
      await hub.handle(createReq(), b)
      expect([a.statusCode, b.statusCode]).toEqual([200, 200])
    })
  })

  describe('disconnects', () => {
    it('cleans up on client disconnect', async () => {
      const res = createRes()
      await hub.handle(createReq(), res)
      res.disconnect()

      expect(hub.counts()).toEqual({ total: 0, perKey: {}, perIp: {} })
      res.chunks.length = 0
      jest.advanceTimersByTime(60_000)
      await bus.publish(changeEvent())
      await settle()
      expect(res.chunks).toEqual([])
    })

    it('reserves nothing when the client disconnects during authentication', async () => {
      let resolveAccess: (value: unknown) => void = () => {}
      sdkService.resolveSdkAccess.mockReturnValue(
        new Promise((resolve) => {
          resolveAccess = resolve
        })
      )
      const req = createReq()
      const res = createRes()
      const pending = hub.handle(req, res)
      await settle()
      // Request 'close' may already have fired before; only the socket
      // closing is observable here
      res.disconnect()
      resolveAccess(access())
      await pending

      expect(hub.counts()).toEqual({ total: 0, perKey: {}, perIp: {} })
      expect(res.write).not.toHaveBeenCalled()
      expect(res.json).not.toHaveBeenCalled()
    })

    it('detects a destroyed socket after authentication even without a close event', async () => {
      let resolveAccess: (value: unknown) => void = () => {}
      sdkService.resolveSdkAccess.mockReturnValue(
        new Promise((resolve) => {
          resolveAccess = resolve
        })
      )
      const req = createReq()
      const res = createRes()
      const pending = hub.handle(req, res)
      req.socket.destroyed = true
      resolveAccess(access())
      await pending

      expect(hub.counts().total).toBe(0)
    })

    it('frees the slot when the client disconnects during the version lookup', async () => {
      let resolveVersion: (v: number) => void = () => {}
      changeEvents.getVersion.mockReturnValue(
        new Promise((resolve) => {
          resolveVersion = resolve
        })
      )
      const res = createRes()
      const pending = hub.handle(createReq(), res)
      await settle()
      res.disconnect()
      resolveVersion(5)
      await pending

      expect(hub.counts()).toEqual({ total: 0, perKey: {}, perIp: {} })
      expect(res.write).not.toHaveBeenCalled()
    })

    it('frees the slot when the version lookup fails', async () => {
      changeEvents.getVersion.mockRejectedValue(new Error('db'))
      const res = createRes()
      await hub.handle(createReq(), res)
      expect(res.statusCode).toBe(500)
      expect(hub.counts().total).toBe(0)
    })

    it('releases streams whose response was destroyed at the next heartbeat', async () => {
      const res = createRes()
      await hub.handle(createReq(), res)
      res.destroyed = true

      jest.advanceTimersByTime(25_000)

      expect(hub.counts().total).toBe(0)
    })
  })

  describe('backpressure', () => {
    it('closes a stream that does not drain within 3 heartbeats', async () => {
      const res = createRes()
      await hub.handle(createReq(), res)
      res.writeReturns = false
      await bus.publish(changeEvent())
      await settle()
      const writes = res.write.mock.calls.length

      jest.advanceTimersByTime(25_000 * 2)
      expect(hub.counts().total).toBe(1)
      jest.advanceTimersByTime(25_000)

      expect(hub.counts().total).toBe(0)
      expect(res.end).toHaveBeenCalled()
      // No heartbeats are queued on a stalled socket
      expect(res.write.mock.calls.length).toBe(writes)
    })

    it('keeps a stream that drains in time', async () => {
      const res = createRes()
      await hub.handle(createReq(), res)
      res.writeReturns = false
      await bus.publish(changeEvent())
      await settle()
      jest.advanceTimersByTime(25_000 * 2)
      res.writeReturns = true
      res.emit('drain')
      jest.advanceTimersByTime(25_000 * 3)

      expect(hub.counts().total).toBe(1)
    })
  })

  describe('revalidation', () => {
    it('closes the stream when the key is revoked (checked on events)', async () => {
      const res = createRes()
      await hub.handle(createReq(), res)
      res.chunks.length = 0
      sdkService.resolveSdkAccess.mockRejectedValue(
        new UnauthorizedException('Invalid API key')
      )

      await bus.publish(changeEvent())
      await settle()

      expect(res.chunks).toEqual([])
      expect(res.end).toHaveBeenCalled()
      expect(hub.counts().total).toBe(0)
    })

    it('revalidates the key every 5 minutes', async () => {
      const res = createRes()
      await hub.handle(createReq(), res)
      sdkService.resolveSdkAccess.mockRejectedValue(
        new ForbiddenException('Origin not allowed')
      )

      jest.advanceTimersByTime(300_000)
      await settle()

      expect(res.end).toHaveBeenCalled()
      expect(hub.counts().total).toBe(0)
    })

    it('batches the periodic revalidation per key and origin', async () => {
      await hub.handle(createReq(), createRes())
      await hub.handle(createReq(), createRes())
      await hub.handle(
        createReq({ headers: { origin: 'https://a.example' } }),
        createRes()
      )
      sdkService.resolveSdkAccess.mockClear()

      jest.advanceTimersByTime(300_000)
      await settle()

      expect(sdkService.resolveSdkAccess).toHaveBeenCalledTimes(2)
    })

    it('keeps the stream open on transient revalidation errors', async () => {
      const res = createRes()
      await hub.handle(createReq(), res)
      sdkService.resolveSdkAccess.mockRejectedValue(new Error('db down'))

      jest.advanceTimersByTime(300_000)
      await settle()

      expect(res.end).not.toHaveBeenCalled()
      expect(hub.counts().total).toBe(1)
    })

    it('revalidates streams sharing a key with one lookup per event', async () => {
      const a = createRes()
      const b = createRes()
      await hub.handle(createReq(), a)
      await hub.handle(createReq(), b)
      sdkService.resolveSdkAccess.mockClear()

      await bus.publish(changeEvent())
      await settle()

      expect(sdkService.resolveSdkAccess).toHaveBeenCalledTimes(1)
      expect(a.text()).toContain('flags-changed')
      expect(b.text()).toContain('flags-changed')
    })
  })

  it('close() / onModuleDestroy ends all streams and unsubscribes', async () => {
    const res = createRes()
    await hub.handle(createReq(), res)
    await hub.onModuleDestroy()

    expect(res.end).toHaveBeenCalled()
    expect(hub.counts().total).toBe(0)
    res.chunks.length = 0
    await bus.publish(changeEvent())
    await settle()
    expect(res.chunks).toEqual([])
  })
})
