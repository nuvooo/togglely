import { EventEmitter } from 'events'
import {
  CHANGE_BUS_CHANNEL,
  createChangeBus,
  InMemoryChangeBus,
  RedisChangeBus,
  RedisLike,
} from './change-bus'
import { FlagsChangedEvent } from './change-events.types'

const event = (overrides: Partial<FlagsChangedEvent> = {}): FlagsChangedEvent => ({
  eventId: 'evt-1',
  organizationId: 'org',
  projectId: 'p1',
  projectKey: 'proj',
  environmentId: 'e1',
  environmentKey: 'dev',
  version: 3,
  changes: [{ flagKey: 'a', action: 'toggled' }],
  createdAt: '2026-11-09T00:00:00.000Z',
  ...overrides,
})

const silentLogger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() }

/** Minimal in-process stand-in for an ioredis connection (pub or sub). */
class FakeRedis extends EventEmitter implements RedisLike {
  static broker = new EventEmitter()
  subscribed: string[] = []
  connectError: Error | null = null
  publishError: Error | null = null
  quit = jest.fn(async () => 'OK')
  disconnect = jest.fn()

  async connect() {
    if (this.connectError) throw this.connectError
  }

  async subscribe(channel: string) {
    this.subscribed.push(channel)
    FakeRedis.broker.on(channel, (msg: string) =>
      this.emit('message', channel, msg)
    )
    return 1
  }

  async publish(channel: string, message: string) {
    if (this.publishError) throw this.publishError
    FakeRedis.broker.emit(channel, message)
    return 1
  }
}

beforeEach(() => {
  FakeRedis.broker.removeAllListeners()
  jest.clearAllMocks()
})

describe('InMemoryChangeBus', () => {
  it('delivers published events to all subscribers', async () => {
    const bus = new InMemoryChangeBus()
    const a = jest.fn()
    const b = jest.fn()
    bus.subscribe(a)
    bus.subscribe(b)

    await bus.publish(event())

    expect(a).toHaveBeenCalledWith(event())
    expect(b).toHaveBeenCalledWith(event())
  })

  it('stops delivering after unsubscribe', async () => {
    const bus = new InMemoryChangeBus()
    const handler = jest.fn()
    const unsubscribe = bus.subscribe(handler)
    unsubscribe()

    await bus.publish(event())

    expect(handler).not.toHaveBeenCalled()
  })

  it('isolates a throwing subscriber from the others', async () => {
    const bus = new InMemoryChangeBus(silentLogger)
    const good = jest.fn()
    bus.subscribe(() => {
      throw new Error('boom')
    })
    bus.subscribe(good)

    await expect(bus.publish(event())).resolves.toBeUndefined()
    expect(good).toHaveBeenCalled()
  })

  it('supports many subscribers without listener warnings', async () => {
    const bus = new InMemoryChangeBus()
    const warn = jest.spyOn(process, 'emitWarning').mockImplementation()
    for (let i = 0; i < 1000; i++) bus.subscribe(() => {})
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('RedisChangeBus', () => {
  it('publishes JSON on the shared channel and delivers to subscribers', async () => {
    const pub = new FakeRedis()
    const sub = new FakeRedis()
    const bus = new RedisChangeBus(pub, sub, silentLogger)
    await bus.start()
    const handler = jest.fn()
    bus.subscribe(handler)

    await bus.publish(event())

    expect(sub.subscribed).toEqual([CHANGE_BUS_CHANNEL])
    expect(CHANGE_BUS_CHANNEL).toBe('togglely:flags-changed')
    expect(handler).toHaveBeenCalledWith(event())
  })

  it('receives events published by another instance', async () => {
    const busA = new RedisChangeBus(new FakeRedis(), new FakeRedis(), silentLogger)
    const busB = new RedisChangeBus(new FakeRedis(), new FakeRedis(), silentLogger)
    await busA.start()
    await busB.start()
    const handler = jest.fn()
    busB.subscribe(handler)

    await busA.publish(event({ version: 9 }))

    expect(handler).toHaveBeenCalledWith(event({ version: 9 }))
  })

  it('ignores malformed messages', async () => {
    const sub = new FakeRedis()
    const bus = new RedisChangeBus(new FakeRedis(), sub, silentLogger)
    await bus.start()
    const handler = jest.fn()
    bus.subscribe(handler)

    sub.emit('message', CHANGE_BUS_CHANNEL, '{not json')
    sub.emit('message', CHANGE_BUS_CHANNEL, JSON.stringify({ foo: 1 }))
    sub.emit('message', 'other-channel', JSON.stringify(event()))

    expect(handler).not.toHaveBeenCalled()
  })

  it('falls back to local delivery when publishing fails', async () => {
    const pub = new FakeRedis()
    pub.publishError = new Error('down')
    const bus = new RedisChangeBus(pub, new FakeRedis(), silentLogger)
    await bus.start()
    const handler = jest.fn()
    bus.subscribe(handler)

    await expect(bus.publish(event())).resolves.toBeUndefined()

    expect(handler).toHaveBeenCalledWith(event())
    expect(silentLogger.warn).toHaveBeenCalled()
  })

  it('closes both connections', async () => {
    const pub = new FakeRedis()
    const sub = new FakeRedis()
    const bus = new RedisChangeBus(pub, sub, silentLogger)
    await bus.start()
    await bus.close()
    expect(pub.quit).toHaveBeenCalled()
    expect(sub.quit).toHaveBeenCalled()
  })
})

describe('createChangeBus', () => {
  it('uses the in-memory bus without REDIS_URL', async () => {
    const factory = jest.fn()
    const bus = await createChangeBus({}, silentLogger, factory)
    expect(bus).toBeInstanceOf(InMemoryChangeBus)
    expect(factory).not.toHaveBeenCalled()
  })

  it('uses Redis when REDIS_URL is set', async () => {
    const factory = jest.fn(() => new FakeRedis())
    const bus = await createChangeBus(
      { REDIS_URL: 'redis://localhost:6379' },
      silentLogger,
      factory
    )
    expect(bus).toBeInstanceOf(RedisChangeBus)
    expect(factory).toHaveBeenCalledTimes(2)
    expect(factory).toHaveBeenCalledWith('redis://localhost:6379')
  })

  it('falls back to in-memory with a warning when Redis is unreachable', async () => {
    const clients: FakeRedis[] = []
    const factory = jest.fn(() => {
      const client = new FakeRedis()
      client.connectError = new Error('ECONNREFUSED')
      clients.push(client)
      return client
    })

    const bus = await createChangeBus(
      { REDIS_URL: 'redis://nowhere:6379' },
      silentLogger,
      factory
    )

    expect(bus).toBeInstanceOf(InMemoryChangeBus)
    expect(silentLogger.warn).toHaveBeenCalled()
    for (const client of clients) expect(client.disconnect).toHaveBeenCalled()
  })
})
