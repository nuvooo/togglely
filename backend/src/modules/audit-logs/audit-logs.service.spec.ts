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
    await expect(service.findByOrganization('')).resolves.toEqual([])
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
})
