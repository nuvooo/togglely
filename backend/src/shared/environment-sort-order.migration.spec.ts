import {
  ENVIRONMENT_SORT_ORDER_MIGRATION_ID,
  migrateEnvironmentSortOrder,
} from './environment-sort-order.migration'

interface Env {
  id: string
  projectId: string
  sortOrder: number
  createdAt: Date
}

interface Marker {
  startedAt: Date
  completedAt?: Date
  updated?: number
}

const toDate = (value: any): Date => new Date(value?.$date ?? value)
const d = (n: number) => new Date(2024, 0, n)

/** In-memory fake of the Prisma calls the migration uses. */
function fakePrisma(envs: Env[]) {
  const markers = new Map<string, Marker>()
  const store = envs.map((e) => ({ ...e }))
  return {
    store,
    markers,
    $runCommandRaw: jest.fn(async (cmd: any) => {
      if (cmd.insert === 'migrations') {
        const doc = cmd.documents[0]
        if (markers.has(doc._id)) {
          return {
            ok: 1,
            writeErrors: [{ code: 11000, errmsg: 'E11000 duplicate key' }],
          }
        }
        markers.set(doc._id, { startedAt: toDate(doc.startedAt) })
        return { ok: 1, n: 1 }
      }
      if (cmd.update === 'migrations') {
        let n = 0
        for (const { q, u } of cmd.updates) {
          const marker = markers.get(q._id)
          if (!marker) continue
          if (q.completedAt?.$exists === false && marker.completedAt) continue
          if (q.startedAt?.$lt && !(marker.startedAt < toDate(q.startedAt.$lt)))
            continue
          const set = u.$set ?? {}
          if (set.startedAt) marker.startedAt = toDate(set.startedAt)
          if (set.completedAt) marker.completedAt = toDate(set.completedAt)
          if (set.updated !== undefined) marker.updated = set.updated
          n++
        }
        return { ok: 1, n }
      }
      if (cmd.delete === 'migrations') {
        markers.delete(cmd.deletes[0].q._id)
      }
      return { ok: 1 }
    }),
    environment: {
      findMany: jest.fn(async () =>
        [...store]
          .sort(
            (a, b) =>
              a.projectId.localeCompare(b.projectId) ||
              a.createdAt.getTime() - b.createdAt.getTime() ||
              a.id.localeCompare(b.id)
          )
          .map((e) => ({ ...e }))
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const env = store.find(
          (e) => e.id === where.id && e.sortOrder === where.sortOrder
        )
        if (!env) return { count: 0 }
        env.sortOrder = data.sortOrder
        return { count: 1 }
      }),
    },
  }
}

const logger = { log: jest.fn() }
const orderOf = (store: Env[], projectId: string) =>
  store
    .filter((e) => e.projectId === projectId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((e) => e.id)

describe('migrateEnvironmentSortOrder', () => {
  it('numbers each project by createdAt ascending', async () => {
    const prisma = fakePrisma([
      { id: 'p1-prod', projectId: 'p1', sortOrder: 0, createdAt: d(2) },
      { id: 'p1-dev', projectId: 'p1', sortOrder: 0, createdAt: d(1) },
      { id: 'p1-stage', projectId: 'p1', sortOrder: 0, createdAt: d(5) },
      { id: 'p2-dev', projectId: 'p2', sortOrder: 0, createdAt: d(3) },
      { id: 'p2-prod', projectId: 'p2', sortOrder: 0, createdAt: d(4) },
    ])

    const updated = await migrateEnvironmentSortOrder(prisma as any, logger)

    expect(orderOf(prisma.store, 'p1')).toEqual([
      'p1-dev',
      'p1-prod',
      'p1-stage',
    ])
    expect(prisma.store.find((e) => e.id === 'p1-stage')?.sortOrder).toBe(2)
    expect(orderOf(prisma.store, 'p2')).toEqual(['p2-dev', 'p2-prod'])
    // The first env of each project already has sortOrder 0
    expect(updated).toBe(3)
    const marker = prisma.markers.get(ENVIRONMENT_SORT_ORDER_MIGRATION_ID)
    expect(marker?.completedAt).toBeInstanceOf(Date)
    expect(marker?.updated).toBe(3)
  })

  it('leaves projects that already have a persisted order alone', async () => {
    const prisma = fakePrisma([
      { id: 'a', projectId: 'p1', sortOrder: 1, createdAt: d(1) },
      { id: 'b', projectId: 'p1', sortOrder: 0, createdAt: d(2) },
    ])

    expect(await migrateEnvironmentSortOrder(prisma as any, logger)).toBe(0)
    expect(orderOf(prisma.store, 'p1')).toEqual(['b', 'a'])
  })

  it('runs only once', async () => {
    const prisma = fakePrisma([
      { id: 'a', projectId: 'p1', sortOrder: 0, createdAt: d(1) },
      { id: 'b', projectId: 'p1', sortOrder: 0, createdAt: d(2) },
    ])

    expect(await migrateEnvironmentSortOrder(prisma as any, logger)).toBe(1)
    prisma.store.push({
      id: 'c',
      projectId: 'p2',
      sortOrder: 0,
      createdAt: d(3),
    })
    prisma.store.push({
      id: 'e',
      projectId: 'p2',
      sortOrder: 0,
      createdAt: d(4),
    })
    expect(await migrateEnvironmentSortOrder(prisma as any, logger)).toBeNull()
    expect(prisma.environment.findMany).toHaveBeenCalledTimes(1)
  })

  it('skips while another instance holds a fresh marker', async () => {
    const prisma = fakePrisma([])
    prisma.markers.set(ENVIRONMENT_SORT_ORDER_MIGRATION_ID, {
      startedAt: new Date(),
    })
    expect(await migrateEnvironmentSortOrder(prisma as any, logger)).toBeNull()
    expect(prisma.environment.findMany).not.toHaveBeenCalled()
  })

  it('releases the marker on failure so the next boot retries', async () => {
    const prisma = fakePrisma([])
    prisma.environment.findMany.mockRejectedValueOnce(new Error('boom'))

    await expect(
      migrateEnvironmentSortOrder(prisma as any, logger)
    ).rejects.toThrow('boom')
    expect(prisma.markers.has(ENVIRONMENT_SORT_ORDER_MIGRATION_ID)).toBe(false)
  })
})
