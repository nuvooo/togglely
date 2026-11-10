import { BadRequestException } from '@nestjs/common'
import { EnvironmentsService } from './environments.service'

function createService() {
  const prisma = {
    environment: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn(),
    },
    flagEnvironment: {
      deleteMany: jest.fn(),
    },
    targetingRule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    configVersion: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    webhook: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  } as any
  const auditLogs = { create: jest.fn().mockResolvedValue({}) } as any

  const changes = {
    recordChange: jest.fn().mockResolvedValue(undefined),
  } as any

  const service = new EnvironmentsService(prisma, auditLogs, changes)
  return { service, prisma, auditLogs, changes }
}

const ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }]

describe('EnvironmentsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('findByProject', () => {
    it('returns environments for a project in persisted order', async () => {
      const { service, prisma } = createService()
      const mockEnvs = [
        {
          id: 'env-1',
          name: 'Development',
          key: 'development',
          projectId: 'proj-1',
        },
        {
          id: 'env-2',
          name: 'Production',
          key: 'production',
          projectId: 'proj-1',
        },
      ]
      prisma.environment.findMany.mockResolvedValue(mockEnvs)

      const result = await service.findByProject('proj-1')

      expect(result).toHaveLength(2)
      expect(prisma.environment.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: ORDER,
      })
    })

    it('returns empty array when no environments exist', async () => {
      const { service, prisma } = createService()
      prisma.environment.findMany.mockResolvedValue([])

      const result = await service.findByProject('proj-1')

      expect(result).toHaveLength(0)
    })
  })

  describe('create', () => {
    it('creates the first environment with sortOrder 0', async () => {
      const { service, prisma } = createService()
      const mockEnv = {
        id: 'env-new',
        name: 'Staging',
        key: 'staging',
        projectId: 'proj-1',
        organizationId: 'org-1',
      }
      prisma.environment.create.mockResolvedValue(mockEnv)

      const result = await service.create('proj-1', 'org-1', {
        name: 'Staging',
        key: 'staging',
      })

      expect(result.name).toBe('Staging')
      expect(prisma.environment.create).toHaveBeenCalledWith({
        data: {
          name: 'Staging',
          key: 'staging',
          projectId: 'proj-1',
          organizationId: 'org-1',
          sortOrder: 0,
        },
      })
    })

    it('appends the new environment after the last one (max + 1)', async () => {
      const { service, prisma } = createService()
      prisma.environment.findFirst.mockResolvedValue({ sortOrder: 4 })
      prisma.environment.create.mockImplementation(({ data }: any) => data)

      const result = await service.create('proj-1', 'org-1', {
        name: 'Staging',
        key: 'staging',
      })

      expect(prisma.environment.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })
      expect(result.sortOrder).toBe(5)
    })
  })

  describe('update', () => {
    it('updates the environment name', async () => {
      const { service, prisma } = createService()
      prisma.environment.update.mockResolvedValue({
        id: 'env-1',
        name: 'Staging Updated',
      })

      const result = await service.update('env-1', { name: 'Staging Updated' })

      expect(result.name).toBe('Staging Updated')
      expect(prisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-1' },
        data: { name: 'Staging Updated' },
      })
    })

    it('only forwards whitelisted fields to prisma', async () => {
      const { service, prisma } = createService()
      prisma.environment.update.mockResolvedValue({ id: 'env-1' })

      await service.update('env-1', {
        name: 'Renamed',
        projectId: 'other-project',
        organizationId: 'other-org',
        sortOrder: 99,
      } as any)

      expect(prisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-1' },
        data: { name: 'Renamed' },
      })
    })
  })

  describe('delete', () => {
    it('deletes flag environments first, then the environment', async () => {
      const { service, prisma } = createService()
      prisma.flagEnvironment.deleteMany.mockResolvedValue({ count: 3 })
      prisma.environment.delete.mockResolvedValue({})

      await service.delete('env-1')

      expect(prisma.flagEnvironment.deleteMany).toHaveBeenCalledWith({
        where: { environmentId: 'env-1' },
      })
      expect(prisma.environment.delete).toHaveBeenCalledWith({
        where: { id: 'env-1' },
      })
    })
  })

  describe('reorder', () => {
    const projectEnvs = [{ id: 'env-a' }, { id: 'env-b' }, { id: 'env-c' }]

    it.each([
      ['a foreign id', ['env-a', 'env-b', 'env-x']],
      ['a missing id', ['env-a', 'env-b']],
      ['a duplicate id', ['env-a', 'env-b', 'env-b']],
      ['a duplicate replacing a missing id', ['env-a', 'env-a', 'env-c']],
      ['an extra id', ['env-a', 'env-b', 'env-c', 'env-x']],
    ])('rejects %s with 400 and writes nothing', async (_n, ids) => {
      const { service, prisma, auditLogs } = createService()
      prisma.environment.findMany.mockResolvedValue(projectEnvs)

      await expect(
        service.reorder('proj-1', 'org-1', 'user-1', ids)
      ).rejects.toThrow(BadRequestException)
      expect(prisma.environment.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: ORDER,
        select: { id: true },
      })
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(prisma.environment.updateMany).not.toHaveBeenCalled()
      expect(auditLogs.create).not.toHaveBeenCalled()
    })

    it('persists sortOrder = index in one transaction and returns the ordered list', async () => {
      const { service, prisma, auditLogs } = createService()
      const ordered = [
        { id: 'env-c', sortOrder: 0 },
        { id: 'env-a', sortOrder: 1 },
        { id: 'env-b', sortOrder: 2 },
      ]
      prisma.environment.findMany
        .mockResolvedValueOnce(projectEnvs)
        .mockResolvedValueOnce(ordered)

      const result = await service.reorder('proj-1', 'org-1', 'user-1', [
        'env-c',
        'env-a',
        'env-b',
      ])

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3)
      expect(prisma.environment.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'env-c', projectId: 'proj-1' },
        data: { sortOrder: 0 },
      })
      expect(prisma.environment.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'env-a', projectId: 'proj-1' },
        data: { sortOrder: 1 },
      })
      expect(prisma.environment.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 'env-b', projectId: 'proj-1' },
        data: { sortOrder: 2 },
      })
      expect(prisma.environment.findMany).toHaveBeenLastCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: ORDER,
      })
      expect(result).toEqual(ordered)
      expect(auditLogs.create).toHaveBeenCalledWith({
        action: 'environment.reordered',
        entityType: 'Project',
        entityId: 'proj-1',
        userId: 'user-1',
        organizationId: 'org-1',
        projectId: 'proj-1',
        oldValues: { environmentIds: ['env-a', 'env-b', 'env-c'] },
        newValues: { environmentIds: ['env-c', 'env-a', 'env-b'] },
      })
    })

    it('still returns the new order when writing the audit log fails', async () => {
      const { service, prisma, auditLogs } = createService()
      prisma.environment.findMany
        .mockResolvedValueOnce([{ id: 'env-a' }])
        .mockResolvedValueOnce([{ id: 'env-a', sortOrder: 0 }])
      auditLogs.create.mockRejectedValue(new Error('db down'))

      await expect(
        service.reorder('proj-1', 'org-1', 'user-1', ['env-a'])
      ).resolves.toEqual([{ id: 'env-a', sortOrder: 0 }])
    })
  })
})

describe('EnvironmentsService change events', () => {
  const env = {
    id: 'env-1',
    key: 'staging',
    name: 'Staging',
    projectId: 'proj-1',
    organizationId: 'org-1',
  }
  const changed = {
    organizationId: 'org-1',
    projectId: 'proj-1',
    environmentIds: ['env-1'],
    changes: [{ action: 'environment_changed' }],
  }

  it('create records environment_changed for the new environment', async () => {
    const { service, prisma, changes } = createService()
    prisma.environment.create.mockResolvedValue(env)

    await service.create('proj-1', 'org-1', { name: 'Staging', key: 'staging' })

    expect(changes.recordChange).toHaveBeenCalledWith(changed)
  })

  it('create records nothing when the write fails', async () => {
    const { service, prisma, changes } = createService()
    prisma.environment.create.mockRejectedValue(new Error('duplicate'))

    await expect(
      service.create('proj-1', 'org-1', { name: 'Staging', key: 'staging' })
    ).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('update records environment_changed for that environment', async () => {
    const { service, prisma, changes } = createService()
    prisma.environment.update.mockResolvedValue(env)

    await service.update('env-1', { name: 'Staging' })

    expect(changes.recordChange).toHaveBeenCalledWith(changed)
  })

  it('update records nothing when the write fails', async () => {
    const { service, prisma, changes } = createService()
    prisma.environment.update.mockRejectedValue(new Error('x'))

    await expect(service.update('env-1', { name: 'S' })).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('delete records environment_changed with the key fallback, then removes the config version', async () => {
    const { service, prisma, changes } = createService()
    const order: string[] = []
    prisma.environment.delete.mockResolvedValue(env)
    changes.recordChange.mockImplementation(async () => {
      order.push('record')
    })
    prisma.configVersion.deleteMany.mockImplementation(async () => {
      order.push('cleanup')
      return { count: 1 }
    })

    await service.delete('env-1')

    expect(changes.recordChange).toHaveBeenCalledWith({
      ...changed,
      environmentKeys: { 'env-1': 'staging' },
    })
    expect(prisma.configVersion.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1', environmentId: 'env-1' },
    })
    // The version increment must not recreate the removed document
    expect(order).toEqual(['record', 'cleanup'])
  })

  it('delete succeeds even when the config version cleanup fails', async () => {
    const { service, prisma } = createService()
    prisma.environment.delete.mockResolvedValue(env)
    prisma.configVersion.deleteMany.mockRejectedValue(new Error('db down'))

    await expect(service.delete('env-1')).resolves.toBeUndefined()
  })

  describe('delete: webhook scopes', () => {
    const scoped = [
      {
        id: 'hook-multi',
        organizationId: 'org-1',
        projectId: 'proj-1',
        environmentIds: ['env-1', 'env-2'],
        enabled: true,
      },
      {
        id: 'hook-only',
        organizationId: 'org-1',
        projectId: 'proj-1',
        environmentIds: ['env-1'],
        enabled: true,
      },
    ]

    it('removes the environment from webhook scopes', async () => {
      const { service, prisma } = createService()
      prisma.environment.delete.mockResolvedValue(env)
      prisma.webhook.findMany.mockResolvedValue(scoped)

      await service.delete('env-1')

      expect(prisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: 'proj-1', environmentIds: { has: 'env-1' } },
        })
      )
      expect(prisma.webhook.updateMany).toHaveBeenCalledWith({
        where: { id: 'hook-multi', environmentIds: { has: 'env-1' } },
        data: { environmentIds: { set: ['env-2'] } },
      })
    })

    it('disables (never widens to all) a webhook scoped only to the deleted environment', async () => {
      const { service, prisma } = createService()
      prisma.environment.delete.mockResolvedValue(env)
      prisma.webhook.findMany.mockResolvedValue(scoped)

      await service.delete('env-1')

      expect(prisma.webhook.updateMany).toHaveBeenCalledWith({
        where: { id: 'hook-only', environmentIds: { has: 'env-1' } },
        data: { environmentIds: { set: [] }, enabled: false },
      })
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'webhook.disabled_environment_deleted',
        entityType: 'webhook',
        entityId: 'hook-only',
        organizationId: 'org-1',
        projectId: 'proj-1',
        oldValues: { enabled: true, environmentIds: ['env-1'] },
        newValues: {
          enabled: false,
          environmentIds: [],
          deletedEnvironmentId: 'env-1',
          actor: 'system',
        },
      })
    })

    it('does not audit when the webhook changed meanwhile', async () => {
      const { service, prisma } = createService()
      prisma.environment.delete.mockResolvedValue(env)
      prisma.webhook.findMany.mockResolvedValue([scoped[1]])
      prisma.webhook.updateMany.mockResolvedValue({ count: 0 })

      await service.delete('env-1')

      expect(prisma.auditLog.create).not.toHaveBeenCalled()
    })

    it('delete succeeds even when the webhook cleanup fails', async () => {
      const { service, prisma } = createService()
      prisma.environment.delete.mockResolvedValue(env)
      prisma.webhook.findMany.mockRejectedValue(new Error('db down'))

      await expect(service.delete('env-1')).resolves.toBeUndefined()
    })
  })

  it('delete records nothing when the write fails', async () => {
    const { service, prisma, changes } = createService()
    prisma.environment.delete.mockRejectedValue(new Error('x'))

    await expect(service.delete('env-1')).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
    expect(prisma.configVersion.deleteMany).not.toHaveBeenCalled()
  })

  it('reorder records nothing (order does not change SDK results)', async () => {
    const { service, prisma, changes } = createService()
    prisma.environment.findMany.mockResolvedValue([{ id: 'env-1' }])

    await service.reorder('proj-1', 'org-1', 'user-1', ['env-1'])

    expect(changes.recordChange).not.toHaveBeenCalled()
  })
})
