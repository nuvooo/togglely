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

/** In-memory fake of the bits of Prisma the migration uses. */
function fakePrisma(rows: Row[]) {
  const markers = new Set<string>()
  const store = [...rows]
  const prisma = {
    store,
    markers,
    $runCommandRaw: jest.fn(async (cmd: any) => {
      if (cmd.insert === 'migrations') {
        const id = cmd.documents[0]._id
        if (markers.has(id)) {
          return {
            ok: 1,
            n: 0,
            writeErrors: [{ index: 0, code: 11000, errmsg: 'E11000 duplicate key' }],
          }
        }
        markers.add(id)
        return { ok: 1, n: 1 }
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
        let count = 0
        for (const id of where.id.in) {
          const idx = store.findIndex((r) => r.id === id && r.brandId !== null)
          if (idx >= 0) {
            store.splice(idx, 1)
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
    expect(prisma.markers.has(BRAND_INHERIT_MIGRATION_ID)).toBe(true)
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
