import { OverviewService, RECENT_FLAGS_LIMIT } from './overview.service'

type Row = Record<string, any>
type Where = Record<string, any>

/** Matches the simple `where` shapes the service uses (equality and `in`). */
function matches(row: Row, where: Where = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && 'in' in condition) {
      return (condition.in as unknown[]).includes(row[key])
    }
    return row[key] === condition
  })
}

/** In-memory stand-in for the Prisma models read by the service. */
function fakePrisma(data: Record<string, Row[]>) {
  const model = (name: string) => ({
    findMany: jest.fn(async (args: any = {}) => {
      let rows = (data[name] ?? []).filter((r) => matches(r, args.where))
      if (args.orderBy?.updatedAt === 'desc') {
        rows = [...rows].sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
        )
      }
      if (args.orderBy?.name === 'asc') {
        rows = [...rows].sort((a, b) => a.name.localeCompare(b.name))
      }
      if (args.take) rows = rows.slice(0, args.take)
      return rows.map((r) => {
        const out: Row = {}
        for (const [key, wanted] of Object.entries(args.select ?? {})) {
          if (key === '_count') {
            out._count = {
              featureFlags: (data.featureFlag ?? []).filter(
                (f) => f.projectId === r.id
              ).length,
              environments: (data.environment ?? []).filter(
                (e) => e.projectId === r.id
              ).length,
            }
          } else if (key === 'organization') {
            out.organization = (data.organization ?? []).find(
              (o) => o.id === r.organizationId
            )
          } else if (wanted) {
            out[key] = r[key]
          }
        }
        return args.select ? out : { ...r }
      })
    }),
    count: jest.fn(
      async (args: any = {}) =>
        (data[name] ?? []).filter((r) => matches(r, args.where)).length
    ),
  })
  return {
    organizationMember: model('organizationMember'),
    project: model('project'),
    featureFlag: model('featureFlag'),
    environment: model('environment'),
    flagEnvironment: model('flagEnvironment'),
    experiment: model('experiment'),
  }
}

const day = (n: number) => new Date(Date.UTC(2026, 0, n))

/** Two tenants: Alice is in org A only, Bob in org B only. */
function twoTenants() {
  return {
    organization: [
      { id: 'org-a', name: 'Acme' },
      { id: 'org-b', name: 'Globex' },
    ],
    organizationMember: [
      { userId: 'alice', organizationId: 'org-a', role: 'OWNER' },
      { userId: 'bob', organizationId: 'org-b', role: 'OWNER' },
    ],
    project: [
      {
        id: 'p-a1',
        name: 'Shop',
        key: 'shop',
        type: 'SINGLE',
        organizationId: 'org-a',
        updatedAt: day(1),
      },
      {
        id: 'p-a2',
        name: 'App',
        key: 'app',
        type: 'MULTI',
        organizationId: 'org-a',
        updatedAt: day(2),
      },
      {
        id: 'p-b1',
        name: 'Secret',
        key: 'secret',
        type: 'SINGLE',
        organizationId: 'org-b',
        updatedAt: day(3),
      },
    ],
    environment: [
      { id: 'e-a1-dev', projectId: 'p-a1', key: 'development' },
      { id: 'e-a1-prod', projectId: 'p-a1', key: 'production' },
      { id: 'e-a2-dev', projectId: 'p-a2', key: 'development' },
      { id: 'e-b1-prod', projectId: 'p-b1', key: 'production' },
    ],
    featureFlag: [
      {
        id: 'f1',
        projectId: 'p-a1',
        key: 'dark-mode',
        name: 'Dark mode',
        flagType: 'BOOLEAN',
        updatedAt: day(5),
      },
      {
        id: 'f2',
        projectId: 'p-a1',
        key: 'banner',
        name: 'Banner',
        flagType: 'STRING',
        updatedAt: day(7),
      },
      {
        id: 'f3',
        projectId: 'p-a2',
        key: 'beta',
        name: 'Beta',
        flagType: 'BOOLEAN',
        updatedAt: day(6),
      },
      {
        id: 'fb',
        projectId: 'p-b1',
        key: 'hidden',
        name: 'Hidden',
        flagType: 'BOOLEAN',
        updatedAt: day(9),
      },
    ],
    flagEnvironment: [
      // f1 is enabled in production twice (default + brand override): counted once
      {
        flagId: 'f1',
        environmentId: 'e-a1-prod',
        brandId: null,
        enabled: true,
      },
      {
        flagId: 'f1',
        environmentId: 'e-a1-prod',
        brandId: 'brand-1',
        enabled: true,
      },
      {
        flagId: 'f2',
        environmentId: 'e-a1-prod',
        brandId: null,
        enabled: false,
      },
      // enabled outside production only: not counted
      { flagId: 'f3', environmentId: 'e-a2-dev', brandId: null, enabled: true },
      {
        flagId: 'fb',
        environmentId: 'e-b1-prod',
        brandId: null,
        enabled: true,
      },
    ],
    experiment: [
      { id: 'x1', projectId: 'p-a1', status: 'RUNNING' },
      { id: 'x2', projectId: 'p-a2', status: 'DRAFT' },
      { id: 'xb', projectId: 'p-b1', status: 'RUNNING' },
    ],
  }
}

const serviceFor = (data = twoTenants()) => {
  const prisma = fakePrisma(data)
  return { prisma, service: new OverviewService(prisma as any) }
}

describe('OverviewService', () => {
  it('counts only data of the organizations the user is a member of', async () => {
    const { service } = serviceFor()
    const overview = await service.getOverview('alice')
    expect(overview.counts).toEqual({
      organizations: 1,
      projects: 2,
      flags: 3,
      flagsEnabledInProduction: 1,
      runningExperiments: 1,
    })
  })

  it('never returns projects or flags of other tenants', async () => {
    const alice = await serviceFor().service.getOverview('alice')
    expect(alice.projects.map((p) => p.id).sort()).toEqual(['p-a1', 'p-a2'])
    expect(alice.recentFlags.map((f) => f.id)).not.toContain('fb')
    expect(JSON.stringify(alice)).not.toMatch(/Secret|Globex|hidden/)

    const bob = await serviceFor().service.getOverview('bob')
    expect(bob.projects.map((p) => p.id)).toEqual(['p-b1'])
    expect(bob.recentFlags.map((f) => f.id)).toEqual(['fb'])
    expect(bob.counts).toEqual({
      organizations: 1,
      projects: 1,
      flags: 1,
      flagsEnabledInProduction: 1,
      runningExperiments: 1,
    })
  })

  it('scopes every query to the caller memberships', async () => {
    const { prisma, service } = serviceFor()
    await service.getOverview('alice')
    expect(prisma.organizationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'alice' } })
    )
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: { in: ['org-a'] } } })
    )
    const scoped = [
      prisma.featureFlag.count.mock.calls[0][0],
      prisma.featureFlag.findMany.mock.calls[0][0],
      prisma.experiment.count.mock.calls[0][0],
      prisma.environment.findMany.mock.calls[0][0],
    ]
    for (const args of scoped) {
      expect([...args.where.projectId.in].sort()).toEqual(['p-a1', 'p-a2'])
    }
    expect(prisma.flagEnvironment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { environmentId: { in: ['e-a1-prod'] }, enabled: true },
      })
    )
  })

  it('lists recently changed flags newest first', async () => {
    const { recentFlags } = await serviceFor().service.getOverview('alice')
    expect(recentFlags).toEqual([
      {
        id: 'f2',
        projectId: 'p-a1',
        key: 'banner',
        name: 'Banner',
        flagType: 'STRING',
        updatedAt: day(7),
      },
      {
        id: 'f3',
        projectId: 'p-a2',
        key: 'beta',
        name: 'Beta',
        flagType: 'BOOLEAN',
        updatedAt: day(6),
      },
      {
        id: 'f1',
        projectId: 'p-a1',
        key: 'dark-mode',
        name: 'Dark mode',
        flagType: 'BOOLEAN',
        updatedAt: day(5),
      },
    ])
  })

  it(`returns at most ${RECENT_FLAGS_LIMIT} recent flags`, async () => {
    const data = twoTenants()
    data.featureFlag = Array.from({ length: 15 }, (_, i) => ({
      id: `f${i}`,
      projectId: 'p-a1',
      key: `k${i}`,
      name: `Flag ${i}`,
      flagType: 'BOOLEAN',
      updatedAt: day(i + 1),
    }))
    const { prisma, service } = serviceFor(data)
    const { recentFlags } = await service.getOverview('alice')
    expect(RECENT_FLAGS_LIMIT).toBe(10)
    expect(recentFlags).toHaveLength(10)
    expect(recentFlags[0].id).toBe('f14')
    expect(prisma.featureFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: 'desc' }, take: 10 })
    )
  })

  it('returns projects with organization name and counts', async () => {
    const { projects } = await serviceFor().service.getOverview('alice')
    expect(projects).toEqual([
      {
        id: 'p-a2',
        name: 'App',
        key: 'app',
        type: 'MULTI',
        organizationId: 'org-a',
        organizationName: 'Acme',
        flagCount: 1,
        environmentCount: 1,
        updatedAt: day(2),
      },
      {
        id: 'p-a1',
        name: 'Shop',
        key: 'shop',
        type: 'SINGLE',
        organizationId: 'org-a',
        organizationName: 'Acme',
        flagCount: 2,
        environmentCount: 2,
        updatedAt: day(1),
      },
    ])
  })

  it('reports null for "enabled in production" without a production environment', async () => {
    const data = twoTenants()
    data.environment = data.environment.filter((e) => e.key !== 'production')
    const { prisma, service } = serviceFor(data)
    const { counts } = await service.getOverview('alice')
    expect(counts.flagsEnabledInProduction).toBeNull()
    expect(prisma.flagEnvironment.findMany).not.toHaveBeenCalled()
  })

  it('returns an empty overview for users without organizations', async () => {
    const { prisma, service } = serviceFor()
    const overview = await service.getOverview('nobody')
    expect(overview).toEqual({
      counts: {
        organizations: 0,
        projects: 0,
        flags: 0,
        flagsEnabledInProduction: null,
        runningExperiments: 0,
      },
      recentFlags: [],
      projects: [],
    })
    expect(prisma.project.findMany).not.toHaveBeenCalled()
    expect(prisma.featureFlag.count).not.toHaveBeenCalled()
  })

  it('returns zero counts for organizations without projects', async () => {
    const data = twoTenants()
    data.project = data.project.filter((p) => p.organizationId !== 'org-a')
    const { prisma, service } = serviceFor(data)
    const overview = await service.getOverview('alice')
    expect(overview.counts).toEqual({
      organizations: 1,
      projects: 0,
      flags: 0,
      flagsEnabledInProduction: null,
      runningExperiments: 0,
    })
    expect(prisma.featureFlag.count).not.toHaveBeenCalled()
  })
})
