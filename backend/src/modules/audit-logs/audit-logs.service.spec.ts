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
      expect(args.orderBy).toEqual({ createdAt: 'desc' })
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

    it('returns the createdAt of the last entry as cursor when more exist', async () => {
      const { prisma, service } = setup()
      prisma.auditLog.findMany.mockResolvedValue([
        row('a', '2026-11-09T10:00:03.000Z'),
        row('b', '2026-11-09T10:00:02.000Z'),
        row('c', '2026-11-09T10:00:01.000Z'),
      ])
      const page = await service.findOrganizationPage(ORG, { limit: 2 })
      expect(page.auditLogs.map((l: any) => l.id)).toEqual(['a', 'b'])
      expect(page.nextCursor).toBe('2026-11-09T10:00:02.000Z')
      expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1)
    })

    it('never splits entries with the same timestamp across pages', async () => {
      const { prisma, service } = setup()
      const tie = '2026-11-09T10:00:02.000Z'
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          row('a', '2026-11-09T10:00:03.000Z'),
          row('b', tie),
          row('c', tie),
        ])
        .mockResolvedValueOnce([row('b', tie), row('c', tie), row('d', tie)])
      const page = await service.findOrganizationPage(ORG, {
        limit: 2,
        action: 'flag.',
      })
      // the next page starts strictly before the tie, so all of it belongs here
      expect(page.auditLogs.map((l: any) => l.id)).toEqual(['a', 'b', 'c', 'd'])
      expect(page.nextCursor).toBe(tie)
      expect(prisma.auditLog.findMany.mock.calls[1][0].where).toEqual({
        organizationId: ORG,
        action: { startsWith: 'flag.' },
        createdAt: at(tie),
      })
    })
  })
})
