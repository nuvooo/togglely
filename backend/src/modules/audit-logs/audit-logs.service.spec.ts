import { AuditLogsService } from './audit-logs.service'

function setup(orgIds: string[] = []) {
  const prisma = {
    organizationMember: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          orgIds.map((organizationId) => ({ organizationId }))
        ),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      findRaw: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
  } as any
  return { prisma, service: new AuditLogsService(prisma) }
}

describe('AuditLogsService', () => {
  it('never queries without a filter', async () => {
    const { prisma, service } = setup()
    await expect(service.findAll('')).resolves.toEqual([])
    await expect(service.findForUser('')).resolves.toEqual([])
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('returns [] for users without memberships', async () => {
    const { prisma, service } = setup([])
    await expect(service.findForUser('user-1')).resolves.toEqual([])
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('scopes findForUser to the user organizations', async () => {
    const { prisma, service } = setup(['org-1', 'org-2'])
    await service.findForUser('user-1')
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      organizationId: { in: ['org-1', 'org-2'] },
    })
  })

  it('scopes findAll to the project', async () => {
    const { prisma, service } = setup()
    await service.findAll('proj-1')
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      projectId: 'proj-1',
    })
  })

  it('limits findAll to 100 by default and caps the limit at 200', async () => {
    const { prisma, service } = setup()
    await service.findAll('proj-1')
    await service.findAll('proj-1', { limit: 500 })
    await service.findAll('proj-1', { limit: 20 })
    expect(
      prisma.auditLog.findMany.mock.calls.map((c: any[]) => c[0].take)
    ).toEqual([100, 200, 20])
  })

  it('filters by entity or by the flagId named in the values', async () => {
    const { prisma, service } = setup()
    const flagId = '64a000000000000000000030'
    const projectId = '64a000000000000000000020'
    prisma.auditLog.findRaw.mockResolvedValue([
      { _id: { $oid: 'log-2' } },
      { _id: { $oid: 'log-1' } },
    ])
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'log-1' },
      { id: 'log-2' },
    ])

    const logs = await service.findAll(projectId, {
      entityId: flagId,
      limit: 50,
    })

    expect(prisma.auditLog.findRaw).toHaveBeenCalledWith({
      filter: {
        projectId: { $oid: projectId },
        $or: [
          { entityId: flagId },
          { 'newValues.flagId': flagId },
          { 'oldValues.flagId': flagId },
        ],
      },
      options: { projection: { _id: 1 }, sort: { createdAt: -1 }, limit: 50 },
    })
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['log-2', 'log-1'] },
    })
    expect(prisma.auditLog.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    })
    expect(logs).toEqual([{ id: 'log-1' }, { id: 'log-2' }])
  })

  it('skips the second query when no entry matches the entity', async () => {
    const { prisma, service } = setup()
    await expect(
      service.findAll('64a000000000000000000020', { entityId: 'x' })
    ).resolves.toEqual([])
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('truncates values longer than 1 KB before storing them', async () => {
    const { prisma, service } = setup()
    const big = 'x'.repeat(5000)
    await service.create({
      action: 'flag.value_updated',
      entityType: 'FeatureFlag',
      entityId: 'f1',
      userId: 'u1',
      organizationId: 'o1',
      newValues: { flagId: 'f1', defaultValue: big, nested: { v: big } },
      oldValues: { defaultValue: 'short' },
    })
    const data = prisma.auditLog.create.mock.calls[0][0].data
    expect(data.newValues.flagId).toBe('f1')
    expect(data.newValues.defaultValue.length).toBeLessThanOrEqual(1024 + 20)
    expect(data.newValues.defaultValue).toMatch(/…\[truncated\]$/)
    expect(data.newValues.nested.v).toMatch(/…\[truncated\]$/)
    expect(data.oldValues).toEqual({ defaultValue: 'short' })
  })

  describe('findOrganizationPage', () => {
    const ORG = '64a000000000000000000010'
    const at = (iso: string) => new Date(iso)
    const row = (id: string, iso: string) => ({ id, createdAt: at(iso) })

    it('scopes to the organization and applies every filter', async () => {
      const { prisma, service } = setup()
      const before = at('2026-11-09T10:00:00.000Z')
      await service.findOrganizationPage(ORG, {
        limit: 20,
        before,
        projectId: 'p1',
        userId: 'u1',
        action: 'flag.',
      })
      const args = prisma.auditLog.findMany.mock.calls[0][0]
      expect(args.where).toEqual({
        organizationId: ORG,
        projectId: 'p1',
        userId: 'u1',
        action: { startsWith: 'flag.' },
        createdAt: { lt: before },
      })
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
      // one extra row tells whether there is a next page
      expect(args.take).toBe(21)
      expect(args.include.project).toEqual({
        select: { id: true, name: true, key: true },
      })
      expect(args.include.user).toBeDefined()
    })

    it('never queries without an organization', async () => {
      const { prisma, service } = setup()
      await expect(service.findOrganizationPage('', {})).resolves.toEqual({
        auditLogs: [],
        nextCursor: null,
      })
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled()
    })

    it('uses 50 entries by default and caps the limit at 200', async () => {
      const { prisma, service } = setup()
      await service.findOrganizationPage(ORG, {})
      await service.findOrganizationPage(ORG, { limit: 999 })
      expect(
        prisma.auditLog.findMany.mock.calls.map((c: any[]) => c[0].take)
      ).toEqual([51, 201])
    })

    it('returns no cursor on the last page', async () => {
      const { prisma, service } = setup()
      prisma.auditLog.findMany.mockResolvedValue([
        row('a', '2026-11-09T10:00:03.000Z'),
        row('b', '2026-11-09T10:00:02.000Z'),
      ])
      const page = await service.findOrganizationPage(ORG, { limit: 2 })
      expect(page.auditLogs.map((l: any) => l.id)).toEqual(['a', 'b'])
      expect(page.nextCursor).toBeNull()
    })

    it('returns createdAt_id of the last entry as cursor when more exist', async () => {
      const { prisma, service } = setup()
      prisma.auditLog.findMany.mockResolvedValue([
        row('a', '2026-11-09T10:00:03.000Z'),
        row('b', '2026-11-09T10:00:02.000Z'),
        row('c', '2026-11-09T10:00:01.000Z'),
      ])
      const page = await service.findOrganizationPage(ORG, { limit: 2 })
      expect(page.auditLogs.map((l: any) => l.id)).toEqual(['a', 'b'])
      expect(page.nextCursor).toBe('2026-11-09T10:00:02.000Z_b')
      expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1)
    })

    it('orders by createdAt and id so equal timestamps page exactly', async () => {
      const { prisma, service } = setup()
      const tie = '2026-11-09T10:00:02.000Z'
      prisma.auditLog.findMany.mockResolvedValue([
        row('d', tie),
        row('c', tie),
        row('b', tie),
      ])
      const page = await service.findOrganizationPage(ORG, { limit: 2 })
      expect(page.auditLogs.map((l: any) => l.id)).toEqual(['d', 'c'])
      expect(page.nextCursor).toBe(tie + '_c')
      expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1)
      expect(prisma.auditLog.findMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ])
    })

    it('continues after a compound cursor inside a timestamp tie', async () => {
      const { prisma, service } = setup()
      const tie = at('2026-11-09T10:00:02.000Z')
      await service.findOrganizationPage(ORG, {
        before: tie,
        beforeId: 'c',
        action: 'flag.',
      })
      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
        organizationId: ORG,
        action: { startsWith: 'flag.' },
        OR: [{ createdAt: { lt: tie } }, { createdAt: tie, id: { lt: 'c' } }],
      })
    })
  })

  describe('findOrganizationUsers', () => {
    const ORG = '64a000000000000000000010'
    const user = (id: string, firstName: string, email = `${id}@x.io`) => ({
      id,
      email,
      firstName,
      lastName: null,
    })

    function usersSetup() {
      const { prisma, service } = setup()
      prisma.auditLog.aggregateRaw = jest
        .fn()
        .mockResolvedValue([{ _id: { $oid: 'u-gone' } }, { _id: { $oid: 'u-1' } }])
      prisma.organizationMember.findMany.mockResolvedValue([
        { userId: 'u-1' },
        { userId: 'u-2' },
      ])
      prisma.user = {
        findMany: jest
          .fn()
          .mockResolvedValue([
            user('u-2', 'Bea'),
            user('u-gone', 'Ada'),
            user('u-1', 'Cleo'),
          ]),
      }
      return { prisma, service }
    }

    it('returns members and former users found in the log, sorted by name', async () => {
      const { prisma, service } = usersSetup()
      const users = await service.findOrganizationUsers(ORG)
      expect(users).toEqual([
        { ...user('u-gone', 'Ada'), isMember: false },
        { ...user('u-2', 'Bea'), isMember: true },
        { ...user('u-1', 'Cleo'), isMember: true },
      ])
      const [{ pipeline }] = prisma.auditLog.aggregateRaw.mock.calls[0]
      expect(pipeline[0]).toEqual({
        $match: { organizationId: { $oid: ORG }, userId: { $ne: null } },
      })
      expect(prisma.organizationMember.findMany.mock.calls[0][0].where).toEqual(
        { organizationId: ORG }
      )
      expect(
        [...prisma.user.findMany.mock.calls[0][0].where.id.in].sort()
      ).toEqual(['u-1', 'u-2', 'u-gone'])
      // never exposes more than the name and email
      expect(prisma.user.findMany.mock.calls[0][0].select).toEqual({
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      })
    })

    it('never queries without an organization', async () => {
      const { prisma, service } = usersSetup()
      await expect(service.findOrganizationUsers('')).resolves.toEqual([])
      expect(prisma.auditLog.aggregateRaw).not.toHaveBeenCalled()
    })
  })
})
