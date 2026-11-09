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
    auditLog: { findMany: jest.fn().mockResolvedValue([]) },
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
})
