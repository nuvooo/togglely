import { InMemoryChangeBus } from './change-bus'
import {
  CHANGE_DEBOUNCE_MS,
  ChangeEventsService,
  MAX_EVENT_CHANGES,
} from './change-events.service'
import { FlagsChangedEvent } from './change-events.types'

const P = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const E1 = 'bbbbbbbbbbbbbbbbbbbbbbb1'
const E2 = 'bbbbbbbbbbbbbbbbbbbbbbb2'

function createPrismaMock() {
  const versions = new Map<string, number>()
  const envKeys: Record<string, string> = { [E1]: 'dev', [E2]: 'prod' }
  return {
    versions,
    configVersion: {
      upsert: jest.fn(async ({ where, create }: any) => {
        const k = `${where.projectId_environmentId.projectId}:${where.projectId_environmentId.environmentId}`
        const version = (versions.get(k) ?? create.version - 1) + 1
        versions.set(k, version)
        return { version }
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const k = `${where.projectId_environmentId.projectId}:${where.projectId_environmentId.environmentId}`
        return versions.has(k) ? { version: versions.get(k) } : null
      }),
    },
    environment: {
      findMany: jest.fn(async () => [{ id: E1 }, { id: E2 }]),
      findUnique: jest.fn(async ({ where }: any) =>
        envKeys[where.id] ? { key: envKeys[where.id] } : null
      ),
    },
    project: {
      findUnique: jest.fn(async () => ({ key: 'shop' })),
    },
  }
}

async function settle() {
  // Let pending promise chains (flush → bus) complete
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('ChangeEventsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>
  let bus: InMemoryChangeBus
  let service: ChangeEventsService
  let events: FlagsChangedEvent[]

  beforeEach(() => {
    jest.useFakeTimers()
    prisma = createPrismaMock()
    bus = new InMemoryChangeBus()
    events = []
    bus.subscribe((e) => events.push(e))
    service = new ChangeEventsService(prisma as any, bus)
    jest.spyOn((service as any).logger, 'error').mockImplementation()
    jest.spyOn((service as any).logger, 'warn').mockImplementation()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('increments the version per environment immediately', async () => {
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes: [{ flagKey: 'a', action: 'toggled' }],
    })
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes: [{ flagKey: 'a', action: 'toggled' }],
    })

    expect(prisma.configVersion.upsert).toHaveBeenCalledWith({
      where: { projectId_environmentId: { projectId: P, environmentId: E1 } },
      create: { projectId: P, environmentId: E1, version: 1 },
      update: { version: { increment: 1 } },
    })
    expect(await service.getVersion(P, E1)).toBe(2)
  })

  it('returns version 0 for unknown environments', async () => {
    expect(await service.getVersion(P, E2)).toBe(0)
  })

  it('publishes one debounced, deduplicated event per environment', async () => {
    const base = { organizationId: 'org', projectId: P, environmentIds: [E1] }
    await service.recordChange({
      ...base,
      changes: [{ flagKey: 'a', action: 'toggled' }],
    })
    await service.recordChange({
      ...base,
      changes: [
        { flagKey: 'a', action: 'toggled' },
        { flagKey: 'b', action: 'updated' },
      ],
    })

    jest.advanceTimersByTime(CHANGE_DEBOUNCE_MS - 1)
    await settle()
    expect(events).toHaveLength(0)

    jest.advanceTimersByTime(1)
    await settle()

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      organizationId: 'org',
      projectId: P,
      projectKey: 'shop',
      environmentId: E1,
      environmentKey: 'dev',
      version: 2,
      changes: [
        { flagKey: 'a', action: 'toggled' },
        { flagKey: 'b', action: 'updated' },
      ],
    })
    expect(events[0].truncated).toBeUndefined()
    expect(events[0].eventId).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Date(events[0].createdAt).toString()).not.toBe('Invalid Date')
  })

  it("resolves 'all' to every environment of the project", async () => {
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: 'all',
      changes: [{ action: 'brand_changed' }],
    })

    expect(prisma.environment.findMany).toHaveBeenCalledWith({
      where: { projectId: P },
      select: { id: true },
    })
    jest.advanceTimersByTime(CHANGE_DEBOUNCE_MS)
    await settle()

    expect(events.map((e) => e.environmentKey).sort()).toEqual(['dev', 'prod'])
    expect(events.every((e) => e.version === 1)).toBe(true)
  })

  it('truncates more than MAX_EVENT_CHANGES changes', async () => {
    const changes = Array.from({ length: MAX_EVENT_CHANGES + 5 }, (_, i) => ({
      flagKey: `f${i}`,
      action: 'updated' as const,
    }))
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes,
    })
    jest.advanceTimersByTime(CHANGE_DEBOUNCE_MS)
    await settle()

    expect(events[0].changes).toHaveLength(MAX_EVENT_CHANGES)
    expect(events[0].truncated).toBe(true)
  })

  it('stops collecting changes beyond the limit (bounded memory)', async () => {
    const changes = Array.from({ length: 5000 }, (_, i) => ({
      flagKey: `f${i}`,
      action: 'updated' as const,
    }))
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes,
    })
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes: [{ flagKey: 'late', action: 'deleted' }],
    })

    const pending = [...(service as any).pending.values()][0]
    expect(pending.changes.size).toBe(MAX_EVENT_CHANGES)
    expect(pending.truncated).toBe(true)

    jest.advanceTimersByTime(CHANGE_DEBOUNCE_MS)
    await settle()
    expect(events[0].changes).toHaveLength(MAX_EVENT_CHANGES)
    expect(events[0].truncated).toBe(true)
  })

  it('does not mark exactly MAX_EVENT_CHANGES changes as truncated', async () => {
    const changes = Array.from({ length: MAX_EVENT_CHANGES }, (_, i) => ({
      flagKey: `f${i}`,
      action: 'updated' as const,
    }))
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes: [...changes, ...changes],
    })
    jest.advanceTimersByTime(CHANGE_DEBOUNCE_MS)
    await settle()
    expect(events[0].changes).toHaveLength(MAX_EVENT_CHANGES)
    expect(events[0].truncated).toBeUndefined()
  })

  it('retries the upsert once when two first upserts race (P2002)', async () => {
    const race = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    })
    prisma.configVersion.upsert
      .mockRejectedValueOnce(race)
      .mockResolvedValueOnce({ version: 2 })

    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes: [{ flagKey: 'a', action: 'toggled' }],
    })

    expect(prisma.configVersion.upsert).toHaveBeenCalledTimes(2)
    expect((service as any).logger.error).not.toHaveBeenCalled()
    expect([...(service as any).pending.values()][0].version).toBe(2)
  })

  it('does not retry other upsert errors', async () => {
    prisma.configVersion.upsert.mockRejectedValueOnce(new Error('db down'))
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes: [{ flagKey: 'a', action: 'toggled' }],
    })
    expect(prisma.configVersion.upsert).toHaveBeenCalledTimes(1)
    expect((service as any).logger.error).toHaveBeenCalled()
  })

  it('never throws when the database fails', async () => {
    prisma.configVersion.upsert.mockRejectedValue(new Error('db down'))
    prisma.environment.findMany.mockRejectedValue(new Error('db down'))

    await expect(
      service.recordChange({
        organizationId: 'org',
        projectId: P,
        environmentIds: [E1],
        changes: [{ flagKey: 'a', action: 'toggled' }],
      })
    ).resolves.toBeUndefined()
    await expect(
      service.recordChange({
        organizationId: 'org',
        projectId: P,
        environmentIds: 'all',
        changes: [{ action: 'brand_changed' }],
      })
    ).resolves.toBeUndefined()
  })

  it('swallows errors while flushing', async () => {
    prisma.project.findUnique.mockRejectedValue(new Error('db down'))
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes: [{ flagKey: 'a', action: 'toggled' }],
    })
    jest.advanceTimersByTime(CHANGE_DEBOUNCE_MS)
    await settle()
    expect(events).toHaveLength(0)
    expect((service as any).logger.error).toHaveBeenCalled()
  })

  it('uses a provided environment key when the environment no longer exists', async () => {
    const gone = 'cccccccccccccccccccccccc'
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [gone],
      environmentKeys: { [gone]: 'staging' },
      changes: [{ action: 'environment_changed' }],
    })
    jest.advanceTimersByTime(CHANGE_DEBOUNCE_MS)
    await settle()
    expect(events[0]).toMatchObject({
      environmentId: gone,
      environmentKey: 'staging',
    })
  })

  it('flushes pending changes on module destroy', async () => {
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes: [{ flagKey: 'a', action: 'deleted' }],
    })

    await service.onModuleDestroy()

    expect(events).toHaveLength(1)
    expect(events[0].changes).toEqual([{ flagKey: 'a', action: 'deleted' }])
  })

  it('does not keep the process alive with debounce timers', async () => {
    const unref = jest.fn()
    const spy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((_fn: any) => ({ unref }) as any) as any)
    await service.recordChange({
      organizationId: 'org',
      projectId: P,
      environmentIds: [E1],
      changes: [{ flagKey: 'a', action: 'toggled' }],
    })
    expect(unref).toHaveBeenCalled()
    spy.mockRestore()
  })
})
