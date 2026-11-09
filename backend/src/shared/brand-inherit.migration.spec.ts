import {
  BRAND_INHERIT_MIGRATION_ID,
  migrateBrandInheritance,
} from './brand-inherit.migration'

interface Row {
  id: string
  flagId: string
  environmentId: string
  brandId: string | null
  enabled: boolean
  defaultValue: string
  rules: number
}

interface Marker {
  startedAt: Date
  completedAt?: Date
  deleted?: number
}

const toDate = (value: any): Date => new Date(value?.$date ?? value)

/** Evaluates the subset of a Prisma `where` the migration's delete uses. */
function matchesDeleteClause(r: Row, clause: any): boolean {
  return (
    r.id === clause.id &&
    r.brandId === clause.brandId &&
    r.flagId === clause.flagId &&
    r.environmentId === clause.environmentId &&
    r.enabled === clause.enabled &&
    r.defaultValue === clause.defaultValue &&
    (clause.targetingRules?.none === undefined || r.rules === 0)
  )
}

/** In-memory fake of the bits of Prisma the migration uses. */
function fakePrisma(rows: Row[], opts: { beforeDelete?: () => void } = {}) {
  const markers = new Map<string, Marker>()
  const store = [...rows]
  const prisma = {
    store,
    markers,
    $runCommandRaw: jest.fn(async (cmd: any) => {
      if (cmd.insert === 'migrations') {
        const doc = cmd.documents[0]
        if (markers.has(doc._id)) {
          return {
            ok: 1,
            n: 0,
            writeErrors: [
              { index: 0, code: 11000, errmsg: 'E11000 duplicate key' },
            ],
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
          if (
            q.startedAt?.$lt &&
            !(marker.startedAt < toDate(q.startedAt.$lt))
          ) {
            continue
          }
          const set = u.$set ?? {}
          if (set.startedAt) marker.startedAt = toDate(set.startedAt)
          if (set.completedAt) marker.completedAt = toDate(set.completedAt)
          if (set.deleted !== undefined) marker.deleted = set.deleted
          n++
        }
        return { ok: 1, n, nModified: n }
      }
      if (cmd.delete === 'migrations') {
        markers.delete(cmd.deletes[0].q._id)
      }
      return { ok: 1 }
    }),
    flagEnvironment: {
      findMany: jest.fn(async ({ where, take }: any) => {
        let result = store.filter((r) =>
          where.brandId === null ? r.brandId === null : r.brandId !== null
        )
        if (where.flagId?.in) {
          result = result.filter((r) => where.flagId.in.includes(r.flagId))
        }
        if (where.id?.gt) result = result.filter((r) => r.id > where.id.gt)
        result.sort((a, b) => a.id.localeCompare(b.id))
        if (take) result = result.slice(0, take)
        return result.map((r) => ({
          ...r,
          targetingRules: Array.from({ length: r.rules }, (_, i) => ({
            id: `${r.id}-r${i}`,
          })),
        }))
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        opts.beforeDelete?.()
        const clauses: any[] = where.OR ?? []
        let count = 0
        for (let i = store.length - 1; i >= 0; i--) {
          if (clauses.some((c) => matchesDeleteClause(store[i], c))) {
            store.splice(i, 1)
            count++
          }
        }
        return { count }
      }),
    },
  }
  return prisma
}

const row = (
  id: string,
  brandId: string | null,
  enabled: boolean,
  defaultValue: string,
  extra: Partial<Row> = {}
): Row => ({
  id,
  flagId: 'f1',
  environmentId: 'e1',
  brandId,
  enabled,
  defaultValue,
  rules: 0,
  ...extra,
})

const logger = { log: jest.fn() }

describe('migrateBrandInheritance', () => {
  it('deletes only rule-less brand rows identical to their default', async () => {
    const prisma = fakePrisma([
      row('a0', null, true, 'blue'),
      row('a1', 'b1', true, 'blue'), // identical copy -> deleted
      row('a2', 'b2', false, 'blue'), // enabled differs -> kept
      row('a3', 'b3', true, 'red'), // value differs -> kept
      row('a4', 'b4', true, 'blue', { rules: 1 }), // own rules -> kept
      row('a5', 'b5', true, 'blue', { environmentId: 'e2' }), // no default -> kept
      row('b0', null, false, 'false', { flagId: 'f2' }),
      row('b1', 'b1', false, 'false', { flagId: 'f2' }), // copy -> deleted
    ])

    const deleted = await migrateBrandInheritance(prisma as any, logger)

    expect(deleted).toBe(2)
    expect(prisma.store.map((r) => r.id).sort()).toEqual([
      'a0',
      'a2',
      'a3',
      'a4',
      'a5',
      'b0',
    ])
    const marker = prisma.markers.get(BRAND_INHERIT_MIGRATION_ID)
    expect(marker?.completedAt).toBeInstanceOf(Date)
    expect(marker?.deleted).toBe(2)
  })

  it('keeps a row edited between read and delete', async () => {
    const prisma = fakePrisma(
      [
        row('a0', null, true, 'blue'),
        row('a1', 'b1', true, 'blue'),
        row('a2', 'b2', true, 'blue'),
        row('a3', 'b3', true, 'blue'),
      ],
      {
        beforeDelete: () => {
          // Concurrent edits after the migration read the rows
          const a1 = prisma.store.find((r) => r.id === 'a1')
          const a2 = prisma.store.find((r) => r.id === 'a2')
          if (a1) a1.defaultValue = 'red'
          if (a2) a2.enabled = false
        },
      }
    )

    expect(await migrateBrandInheritance(prisma as any, logger)).toBe(1)
    expect(prisma.store.map((r) => r.id).sort()).toEqual(['a0', 'a1', 'a2'])
  })

  it('runs only once', async () => {
    const prisma = fakePrisma([
      row('a0', null, true, 'blue'),
      row('a1', 'b1', true, 'blue'),
    ])

    expect(await migrateBrandInheritance(prisma as any, logger)).toBe(1)
    // A new auto-copy would not be touched by a second boot
    prisma.store.push(row('a9', 'b9', true, 'blue'))
    expect(await migrateBrandInheritance(prisma as any, logger)).toBeNull()
    expect(prisma.store.map((r) => r.id)).toContain('a9')
    expect(prisma.flagEnvironment.deleteMany).toHaveBeenCalledTimes(1)
  })

  it('skips while another instance holds a fresh, unfinished marker', async () => {
    const prisma = fakePrisma([
      row('a0', null, true, 'blue'),
      row('a1', 'b1', true, 'blue'),
    ])
    prisma.markers.set(BRAND_INHERIT_MIGRATION_ID, {
      startedAt: new Date(Date.now() - 5 * 60_000),
    })

    expect(await migrateBrandInheritance(prisma as any, logger)).toBeNull()
    expect(prisma.flagEnvironment.findMany).not.toHaveBeenCalled()
  })

  it('skips a completed marker even when it is old', async () => {
    const prisma = fakePrisma([
      row('a0', null, true, 'blue'),
      row('a1', 'b1', true, 'blue'),
    ])
    prisma.markers.set(BRAND_INHERIT_MIGRATION_ID, {
      startedAt: new Date(Date.now() - 60 * 60_000),
      completedAt: new Date(Date.now() - 59 * 60_000),
    })

    expect(await migrateBrandInheritance(prisma as any, logger)).toBeNull()
    expect(prisma.store).toHaveLength(2)
  })

  it('re-runs when an unfinished marker is older than 15 minutes', async () => {
    const prisma = fakePrisma([
      row('a0', null, true, 'blue'),
      row('a1', 'b1', true, 'blue'),
    ])
    const stale = new Date(Date.now() - 16 * 60_000)
    prisma.markers.set(BRAND_INHERIT_MIGRATION_ID, { startedAt: stale })

    expect(await migrateBrandInheritance(prisma as any, logger)).toBe(1)
    const marker = prisma.markers.get(BRAND_INHERIT_MIGRATION_ID)
    expect(marker?.completedAt).toBeInstanceOf(Date)
    expect(marker?.startedAt.getTime()).toBeGreaterThan(stale.getTime())
    // The next boot sees the completed marker
    expect(await migrateBrandInheritance(prisma as any, logger)).toBeNull()
  })

  it('treats a thrown duplicate key error as already applied', async () => {
    const prisma = fakePrisma([])
    prisma.$runCommandRaw.mockRejectedValueOnce(
      new Error('E11000 duplicate key error collection: migrations')
    )
    expect(await migrateBrandInheritance(prisma as any, logger)).toBeNull()
    expect(prisma.flagEnvironment.findMany).not.toHaveBeenCalled()
  })

  it('pages through many brand rows', async () => {
    const rows: Row[] = [row('000', null, true, 'v')]
    for (let i = 1; i <= 1200; i++) {
      rows.push(row(String(i).padStart(4, '0'), `b${i}`, true, 'v'))
    }
    const prisma = fakePrisma(rows)

    expect(await migrateBrandInheritance(prisma as any, logger)).toBe(1200)
    expect(prisma.store).toHaveLength(1)
  })

  it('releases the marker when the cleanup fails so the next boot retries', async () => {
    const prisma = fakePrisma([row('a1', 'b1', true, 'blue')])
    prisma.flagEnvironment.findMany.mockRejectedValueOnce(new Error('boom'))

    await expect(
      migrateBrandInheritance(prisma as any, logger)
    ).rejects.toThrow('boom')
    expect(prisma.markers.has(BRAND_INHERIT_MIGRATION_ID)).toBe(false)
  })
})
