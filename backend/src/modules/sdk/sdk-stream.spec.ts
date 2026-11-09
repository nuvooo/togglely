import { EventEmitter } from 'events'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { InMemoryChangeBus } from '../change-events/change-bus'
import { FlagsChangedEvent } from '../change-events/change-events.types'
import { readSdkStreamOptions, SdkStreamHub } from './sdk-stream'

const access = (envId = 'e1', keyId = 'key-1') => ({
  organizationId: 'org',
  apiKeyId: keyId,
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
  req.query = options.apiKey === undefined ? { apiKey: 'k' } : options.apiKey ? { apiKey: options.apiKey } : {}
  req.headers = options.headers ?? {}
  req.ip = options.ip ?? '1.1.1.1'
  req.socket = { setTimeout: jest.fn(), setNoDelay: jest.fn() }
  return req
}

function createRes() {
  const res: any = new EventEmitter()
  res.headers = {} as Record<string, string>
  res.statusCode = 200
  res.chunks = [] as string[]
  res.body = undefined
  res.writableEnded = false
  res.setHeader = jest.fn((k: string, v: string) => {
    res.headers[k.toLowerCase()] = v
  })
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = jest.fn((body: unknown) => {
    res.body = body
    res.writableEnded = true
    return res
  })
  res.flushHeaders = jest.fn()
  res.write = jest.fn((chunk: string) => {
    res.chunks.push(chunk)
    return true
  })
  res.end = jest.fn(() => {
    res.writableEnded = true
  })
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

describe('SdkStreamHub', () => {
  let bus: InMemoryChangeBus
  let sdkService: { resolveSdkAccess: jest.Mock }
  let changeEvents: { getVersion: jest.Mock }
  let hub: SdkStreamHub

  function createHub(options: Partial<ReturnType<typeof readSdkStreamOptions>> = {}) {
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

  it('reads limits from the environment with defaults', () => {
    expect(readSdkStreamOptions({})).toMatchObject({
      maxPerKey: 50,
      maxPerIp: 20,
      heartbeatMs: 25_000,
      revalidateMs: 300_000,
      retryMs: 5000,
    })
    expect(
      readSdkStreamOptions({ SSE_MAX_PER_KEY: '3', SSE_MAX_PER_IP: '2' })
    ).toMatchObject({ maxPerKey: 3, maxPerIp: 2 })
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
      perKey: { 'key-1': 1 },
      perIp: { '1.1.1.1': 1 },
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

  it('sends a catch-up event when Last-Event-ID is behind', async () => {
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

  it('enforces the per-key limit with 429', async () => {
    createHub({ maxPerKey: 2, maxPerIp: 100 })
    await hub.handle(createReq({ ip: '1.0.0.1' }), createRes())
    await hub.handle(createReq({ ip: '1.0.0.2' }), createRes())
    const res = createRes()
    await hub.handle(createReq({ ip: '1.0.0.3' }), res)

    expect(res.statusCode).toBe(429)
    expect(res.body).toMatchObject({ code: 'STREAM_LIMIT' })
    expect(hub.counts().total).toBe(2)
  })

  it('enforces the per-IP limit with 429', async () => {
    createHub({ maxPerKey: 100, maxPerIp: 1 })
    sdkService.resolveSdkAccess
      .mockResolvedValueOnce(access('e1', 'key-a'))
      .mockResolvedValueOnce(access('e1', 'key-b'))
    await hub.handle(createReq(), createRes())
    const res = createRes()
    await hub.handle(createReq(), res)

    expect(res.statusCode).toBe(429)
  })

  it('cleans up on client disconnect', async () => {
    const req = createReq()
    const res = createRes()
    await hub.handle(req, res)
    req.emit('close')

    expect(hub.counts()).toEqual({ total: 0, perKey: {}, perIp: {} })
    res.chunks.length = 0
    jest.advanceTimersByTime(60_000)
    await bus.publish(changeEvent())
    await settle()
    expect(res.chunks).toEqual([])
  })

  it('frees the slot when the client disconnects during setup', async () => {
    let resolveVersion: (v: number) => void = () => {}
    changeEvents.getVersion.mockReturnValue(
      new Promise((resolve) => {
        resolveVersion = resolve
      })
    )
    const req = createReq()
    const res = createRes()
    const pending = hub.handle(req, res)
    await settle()
    req.emit('close')
    resolveVersion(5)
    await pending

    expect(hub.counts().total).toBe(0)
    expect(res.write).not.toHaveBeenCalled()
  })

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

  it('close() ends all streams', async () => {
    const res = createRes()
    await hub.handle(createReq(), res)
    await hub.close()
    expect(res.end).toHaveBeenCalled()
    expect(hub.counts().total).toBe(0)
  })
})
