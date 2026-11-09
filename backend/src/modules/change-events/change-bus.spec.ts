import { EventEmitter } from 'node:events'
import {
  CHANGE_BUS_CHANNEL,
  createChangeBus,
  InMemoryChangeBus,
  RedisChangeBus,
  RedisLike,
  ResilientChangeBus,
} from './change-bus'
import { FlagsChangedEvent } from './change-events.types'

const event = (
  overrides: Partial<FlagsChangedEvent> = {}
): FlagsChangedEvent => ({
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
    const busA = new RedisChangeBus(
      new FakeRedis(),
      new FakeRedis(),
      silentLogger
    )
    const busB = new RedisChangeBus(
      new FakeRedis(),
      new FakeRedis(),
      silentLogger
    )
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
  afterEach(() => {
    jest.useRealTimers()
  })

  it('uses the in-memory bus without REDIS_URL', async () => {
    const factory = jest.fn()
    const bus = await createChangeBus({}, silentLogger, factory)
    expect(bus).toBeInstanceOf(InMemoryChangeBus)
    expect(factory).not.toHaveBeenCalled()
  })

  it('uses Redis when REDIS_URL is set', async () => {
    const factory = jest.fn(() => new FakeRedis())
    const bus = (await createChangeBus(
      { REDIS_URL: 'redis://localhost:6379' },
      silentLogger,
      factory
    )) as ResilientChangeBus
    expect(bus).toBeInstanceOf(ResilientChangeBus)
    expect(bus.mode).toBe('redis')
    expect(factory).toHaveBeenCalledTimes(2)
    expect(factory).toHaveBeenCalledWith('redis://localhost:6379')
    await bus.close()
  })

  it('falls back to in-memory with a warning when Redis is unreachable', async () => {
    jest.useFakeTimers()
    const clients: FakeRedis[] = []
    const factory = jest.fn(() => {
      const client = new FakeRedis()
      client.connectError = new Error('ECONNREFUSED')
      clients.push(client)
      return client
    })

    const bus = (await createChangeBus(
      { REDIS_URL: 'redis://nowhere:6379' },
      silentLogger,
      factory
    )) as ResilientChangeBus

    expect(bus.mode).toBe('memory')
    expect(silentLogger.warn).toHaveBeenCalled()
    for (const client of clients) expect(client.disconnect).toHaveBeenCalled()

    // Still delivers locally
    const handler = jest.fn()
    bus.subscribe(handler)
    await bus.publish(event())
    expect(handler).toHaveBeenCalledWith(event())
    await bus.close()
  })
})

describe('ResilientChangeBus', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  async function settle() {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }

  function failingFactory(state: { up: boolean }) {
    return jest.fn(() => {
      const client = new FakeRedis()
      if (!state.up) client.connectError = new Error('ECONNREFUSED')
      return client
    })
  }

  it('keeps retrying with exponential backoff up to 60 s and switches to Redis once connected', async () => {
    const state = { up: false }
    const factory = failingFactory(state)
    const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() }
    const bus = new ResilientChangeBus('redis://r', logger, factory)
    await bus.start()
    const handler = jest.fn()
    bus.subscribe(handler)
    expect(factory).toHaveBeenCalledTimes(2)

    const attempts = () => factory.mock.calls.length / 2
    const delays = [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]
    for (const delay of delays) {
      const before = attempts()
      jest.advanceTimersByTime(delay - 1)
      await settle()
      expect(attempts()).toBe(before)
      jest.advanceTimersByTime(1)
      await settle()
      expect(attempts()).toBe(before + 1)
    }
    expect(bus.mode).toBe('memory')

    state.up = true
    jest.advanceTimersByTime(60000)
    await settle()

    expect(bus.mode).toBe('redis')
    expect(
      logger.log.mock.calls.filter(([m]) => /using Redis/.test(m))
    ).toHaveLength(1)

    // Subscribers registered before the switch receive Redis events
    await bus.publish(event({ version: 42 }))
    expect(handler).toHaveBeenCalledWith(event({ version: 42 }))

    // No more attempts after connecting
    const after = attempts()
    jest.advanceTimersByTime(600_000)
    await settle()
    expect(attempts()).toBe(after)
    await bus.close()
  })

  it('throttles repeated warnings to one per minute', async () => {
    const factory = failingFactory({ up: false })
    const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() }
    const bus = new ResilientChangeBus('redis://r', logger, factory)
    await bus.start()
    expect(logger.warn).toHaveBeenCalledTimes(1)

    // Retries at 1, 3, 7, 15, 31 s: all within the first minute
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      jest.advanceTimersByTime(delay)
      await settle()
    }
    expect(logger.warn).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(32000) // attempt at 63 s
    await settle()
    expect(logger.warn).toHaveBeenCalledTimes(2)
    await bus.close()
  })

  it('stops retrying when closed', async () => {
    const factory = failingFactory({ up: false })
    const bus = new ResilientChangeBus('redis://r', silentLogger, factory)
    await bus.start()
    await bus.close()
    jest.advanceTimersByTime(600_000)
    await settle()
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
