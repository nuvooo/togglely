import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { FlagsService } from './flags.service'

const mockProject = {
  id: 'proj-1',
  organizationId: 'org-1',
  environments: [
    { id: 'env-1', key: 'production', name: 'Production' },
    { id: 'env-2', key: 'staging', name: 'Staging' },
  ],
}

const mockFlag = {
  id: 'flag-1',
  key: 'my-flag',
  name: 'My Flag',
  description: 'A test flag',
  flagType: 'BOOLEAN',
  projectId: 'proj-1',
  organizationId: 'org-1',
  createdById: 'user-1',
}

function createService() {
  const txMock = {
    featureFlag: {
      create: jest.fn().mockResolvedValue(mockFlag),
      delete: jest.fn().mockResolvedValue(mockFlag),
    },
    flagEnvironment: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'fe-1',
          environmentId: 'env-1',
          enabled: false,
          defaultValue: 'false',
          environment: { name: 'Production' },
        },
      ]),
    },
  }

  const prisma = {
    project: {
      findUnique: jest.fn(),
    },
    organizationMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    featureFlag: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    flagEnvironment: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((cb: any) => cb(txMock)),
  } as any

  const auditLogs = {
    create: jest.fn().mockResolvedValue(undefined),
  } as any

  const changes = {
    recordChange: jest.fn().mockResolvedValue(undefined),
  } as any

  const service = new FlagsService(prisma, auditLogs, changes)
  return { service, prisma, auditLogs, txMock, changes }
}

describe('FlagsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('creates a flag with environments', async () => {
      const { service, prisma, auditLogs } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
      })
      prisma.featureFlag.findFirst.mockResolvedValue(null)

      const result = await service.create('proj-1', 'user-1', {
        name: 'My Flag',
        key: 'my-flag',
        type: 'BOOLEAN',
      })

      expect(result.featureFlag).toBeDefined()
      expect(result.featureFlag.key).toBe('my-flag')
      expect(auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'flag.created' })
      )
    })

    it('throws when project is not found', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(null)

      await expect(
        service.create('proj-missing', 'user-1', {
          name: 'Flag',
          key: 'flag',
          type: 'BOOLEAN',
        })
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws when user has no access', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.organizationMember.findFirst.mockResolvedValue(null)

      await expect(
        service.create('proj-1', 'user-1', {
          name: 'Flag',
          key: 'flag',
          type: 'BOOLEAN',
        })
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws when flag key already exists', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
      })
      prisma.featureFlag.findFirst.mockResolvedValue(mockFlag)

      await expect(
        service.create('proj-1', 'user-1', {
          name: 'My Flag',
          key: 'my-flag',
          type: 'BOOLEAN',
        })
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('findOne', () => {
    it('returns the flag when found', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)

      const result = await service.findOne('flag-1')

      expect(result.id).toBe('flag-1')
      expect(result.key).toBe('my-flag')
    })

    it('returns createdAt and the latest updatedAt of the flag and its values', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue({
        ...mockFlag,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
        flagEnvironments: [{ updatedAt: new Date('2024-05-01T00:00:00Z') }],
      })

      const result = await service.findOne('flag-1')

      expect(prisma.featureFlag.findUnique).toHaveBeenCalledWith({
        where: { id: 'flag-1' },
        include: { flagEnvironments: { select: { updatedAt: true } } },
      })
      expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'))
      expect(result.updatedAt).toEqual(new Date('2024-05-01T00:00:00Z'))
    })

    it('throws when flag is not found', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(null)

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })
  })

  describe('delete', () => {
    it('deletes the flag and its environments', async () => {
      const { service, prisma, auditLogs, txMock } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)

      await service.delete('flag-1', 'user-1')

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(txMock.flagEnvironment.deleteMany).toHaveBeenCalledWith({
        where: { flagId: 'flag-1' },
      })
      expect(txMock.featureFlag.delete).toHaveBeenCalledWith({
        where: { id: 'flag-1' },
      })
      expect(auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'flag.deleted' })
      )
    })

    it('throws NotFoundException when the flag does not exist', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(null)

      await expect(service.delete('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('skips audit log when no userId is provided', async () => {
      const { service, prisma, auditLogs } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)

      await service.delete('flag-1')

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(auditLogs.create).not.toHaveBeenCalled()
    })
  })

  describe('findAll', () => {
    it('scopes to the project when projectId is given', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.organizationMember.findFirst.mockResolvedValue({ role: 'VIEWER' })
      prisma.featureFlag.findMany.mockResolvedValue([mockFlag])

      const result = await service.findAll('user-1', 'proj-1')

      expect(prisma.featureFlag.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
      })
      expect(result).toHaveLength(1)
    })

    it("restricts to the user's organizations when projectId is missing", async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
        { organizationId: 'org-2' },
      ])
      prisma.featureFlag.findMany.mockResolvedValue([mockFlag])

      await service.findAll('user-1')

      expect(prisma.organizationMember.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { organizationId: true },
      })
      expect(prisma.featureFlag.findMany).toHaveBeenCalledWith({
        where: { organizationId: { in: ['org-1', 'org-2'] } },
      })
    })

    it('returns nothing (and never queries all flags) for users without orgs', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([])

      const result = await service.findAll('user-1')

      expect(result).toEqual([])
      expect(prisma.featureFlag.findMany).not.toHaveBeenCalled()
    })
  })

  describe('updateEnvironment', () => {
    it('scopes the FlagEnvironment-id lookup to the flag', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.flagEnvironment.findFirst.mockResolvedValueOnce({
        id: 'fe-1',
        flagId: 'flag-1',
      })
      prisma.flagEnvironment.update.mockResolvedValue({ id: 'fe-1' })

      await service.updateEnvironment('flag-1', 'fe-1', { isEnabled: true })

      expect(prisma.flagEnvironment.findFirst).toHaveBeenNthCalledWith(1, {
        where: { id: 'fe-1', flagId: 'flag-1' },
      })
      expect(prisma.flagEnvironment.update).toHaveBeenCalledWith({
        where: { id: 'fe-1' },
        data: { enabled: true, defaultValue: 'true' },
      })
    })

    it("does not modify another flag's FlagEnvironment", async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      // FlagEnvironment 'fe-foreign' belongs to another flag: every
      // flagId-scoped lookup misses.
      prisma.flagEnvironment.findFirst.mockResolvedValue(null)
      prisma.flagEnvironment.findMany.mockResolvedValue([])

      await expect(
        service.updateEnvironment('flag-1', 'fe-foreign', { isEnabled: true })
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(prisma.flagEnvironment.update).not.toHaveBeenCalled()
    })
  })
})

describe('FlagsService brand inheritance', () => {
  it('toggle changes only the environment default, never brand overrides', async () => {
    const { service, prisma } = createService()
    prisma.flagEnvironment.updateMany = jest.fn()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue({
      id: 'fe-default',
      brandId: null,
      enabled: false,
    })

    const result = await service.toggle('flag-1', 'env-1', true)

    expect(prisma.flagEnvironment.findFirst).toHaveBeenCalledWith({
      where: { flagId: 'flag-1', environmentId: 'env-1', brandId: null },
    })
    expect(prisma.flagEnvironment.update).toHaveBeenCalledWith({
      where: { id: 'fe-default' },
      data: { enabled: true, defaultValue: 'true' },
    })
    expect(prisma.flagEnvironment.updateMany).not.toHaveBeenCalled()
    expect(result).toEqual({
      flagId: 'flag-1',
      environmentId: 'env-1',
      enabled: true,
    })
  })

  it('updateValue with brandId creates an override seeded from the default', async () => {
    const { service, prisma } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue({
      ...mockFlag,
      flagType: 'STRING',
    })
    prisma.flagEnvironment.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.brandId === null
          ? { id: 'fe-default', enabled: true, defaultValue: 'blue' }
          : null
      )
    )

    await service.updateValue('flag-1', 'env-1', {
      value: 'red',
      brandId: 'brand-1',
    })

    expect(prisma.flagEnvironment.create).toHaveBeenCalledWith({
      data: {
        flagId: 'flag-1',
        environmentId: 'env-1',
        brandId: 'brand-1',
        enabled: true,
        defaultValue: 'red',
      },
    })
  })
})

describe('FlagsService (environment order)', () => {
  const ENV_ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  const fe = (environmentId: string, name: string, sortOrder = 0) => ({
    id: `fe-${environmentId}`,
    environmentId,
    brandId: null,
    enabled: false,
    defaultValue: 'false',
    environment: {
      id: environmentId,
      name,
      sortOrder,
      createdAt: new Date(2024, 0, 1),
    },
  })

  it('findByProject returns flag environments in persisted environment order', async () => {
    const { service, prisma } = createService()
    // persisted order: staging (env-2) before production (env-1)
    prisma.project.findUnique.mockResolvedValue({
      ...mockProject,
      environments: [mockProject.environments[1], mockProject.environments[0]],
    })
    prisma.featureFlag.findMany.mockResolvedValue([
      {
        ...mockFlag,
        flagEnvironments: [fe('env-1', 'Production'), fe('env-2', 'Staging')],
      },
    ])

    const result = await service.findByProject('proj-1')

    expect(prisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      include: { environments: { orderBy: ENV_ORDER } },
    })
    expect(result[0].environments.map((e) => e.environmentId)).toEqual([
      'env-2',
      'env-1',
    ])
  })

  it('findByProject returns createdAt and the latest updatedAt of flag and its values', async () => {
    const { service, prisma } = createService()
    prisma.project.findUnique.mockResolvedValue(mockProject)
    prisma.featureFlag.findMany.mockResolvedValue([
      {
        ...mockFlag,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-02-01T00:00:00Z'),
        flagEnvironments: [
          {
            ...fe('env-1', 'Production'),
            updatedAt: new Date('2024-03-05T00:00:00Z'),
          },
          {
            ...fe('env-2', 'Staging'),
            updatedAt: new Date('2024-01-10T00:00:00Z'),
          },
        ],
      },
    ])

    const result = await service.findByProject('proj-1')

    expect(result[0].createdAt).toEqual(new Date('2024-01-01T00:00:00Z'))
    expect(result[0].updatedAt).toEqual(new Date('2024-03-05T00:00:00Z'))
  })

  it('create returns the new flag environments in persisted order', async () => {
    const { service, prisma, txMock } = createService()
    prisma.project.findUnique.mockResolvedValue({
      ...mockProject,
      environments: [mockProject.environments[1], mockProject.environments[0]],
    })
    prisma.organizationMember.findFirst.mockResolvedValue({ role: 'ADMIN' })
    prisma.featureFlag.findFirst.mockResolvedValue(null)
    txMock.flagEnvironment.findMany.mockResolvedValue([
      fe('env-1', 'Production'),
      fe('env-2', 'Staging'),
    ])

    const result = await service.create('proj-1', 'user-1', {
      key: 'new-flag',
      name: 'New',
      type: 'BOOLEAN',
    } as any)

    expect(result.featureFlag.environments.map((e) => e.environmentId)).toEqual(
      ['env-2', 'env-1']
    )
  })

  it('getEnvironments orders by the environment sortOrder', async () => {
    const { service, prisma } = createService()
    prisma.flagEnvironment.findMany.mockResolvedValue([
      fe('env-1', 'Production', 1),
      fe('env-2', 'Staging', 0),
    ])

    const result = await service.getEnvironments('flag-1')

    expect(result.map((e) => e.id)).toEqual(['env-2', 'env-1'])
  })
})

describe('FlagsService change events', () => {
  const flagChange = (action: string) => [{ flagKey: 'my-flag', action }]

  it('create records a created change for all environments', async () => {
    const { service, prisma, changes } = createService()
    prisma.project.findUnique.mockResolvedValue(mockProject)
    prisma.organizationMember.findFirst.mockResolvedValue({ role: 'ADMIN' })
    prisma.featureFlag.findFirst.mockResolvedValue(null)

    await service.create('proj-1', 'user-1', {
      name: 'My Flag',
      key: 'my-flag',
      type: 'BOOLEAN',
    })

    expect(changes.recordChange).toHaveBeenCalledWith({
      organizationId: 'org-1',
      projectId: 'proj-1',
      environmentIds: 'all',
      changes: flagChange('created'),
    })
  })

  it('create records nothing when the transaction fails', async () => {
    const { service, prisma, changes } = createService()
    prisma.project.findUnique.mockResolvedValue(mockProject)
    prisma.organizationMember.findFirst.mockResolvedValue({ role: 'ADMIN' })
    prisma.featureFlag.findFirst.mockResolvedValue(null)
    prisma.$transaction.mockRejectedValue(new Error('db down'))

    await expect(
      service.create('proj-1', 'user-1', {
        name: 'My Flag',
        key: 'my-flag',
        type: 'BOOLEAN',
      })
    ).rejects.toThrow('db down')
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('update records an updated change for all environments', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.update = jest.fn().mockResolvedValue(mockFlag)

    await service.update('flag-1', { name: 'Renamed' })

    expect(changes.recordChange).toHaveBeenCalledWith({
      organizationId: 'org-1',
      projectId: 'proj-1',
      environmentIds: 'all',
      changes: flagChange('updated'),
    })
  })

  it('update writes a flag.updated audit entry with old and new name/description', async () => {
    const { service, prisma, auditLogs } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue({
      ...mockFlag,
      name: 'Old',
      description: 'old text',
    })
    prisma.featureFlag.update = jest.fn().mockResolvedValue({
      ...mockFlag,
      name: 'Renamed',
      description: 'old text',
    })

    await service.update('flag-1', { name: 'Renamed' }, 'user-1')

    expect(auditLogs.create).toHaveBeenCalledWith({
      action: 'flag.updated',
      entityType: 'FeatureFlag',
      entityId: 'flag-1',
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'proj-1',
      oldValues: { flagId: 'flag-1', flagKey: 'my-flag', name: 'Old' },
      newValues: { flagId: 'flag-1', flagKey: 'my-flag', name: 'Renamed' },
    })
  })

  it('update writes no audit entry when nothing changed', async () => {
    const { service, prisma, auditLogs } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.featureFlag.update = jest.fn().mockResolvedValue(mockFlag)

    await service.update('flag-1', { name: mockFlag.name }, 'user-1')

    expect(auditLogs.create).not.toHaveBeenCalled()
  })

  it('a failing audit write does not fail a successful mutation', async () => {
    const { service, prisma, auditLogs } = createService()
    auditLogs.create.mockRejectedValue(new Error('audit down'))
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)

    await expect(service.delete('flag-1', 'user-1')).resolves.toBeUndefined()

    prisma.featureFlag.update = jest
      .fn()
      .mockResolvedValue({ ...mockFlag, name: 'New' })
    await expect(
      service.update('flag-1', { name: 'New' }, 'user-1')
    ).resolves.toEqual(expect.objectContaining({ name: 'New' }))
  })

  it('update records nothing when the write fails', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.update = jest.fn().mockRejectedValue(new Error('x'))

    await expect(service.update('flag-1', { name: 'R' })).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('delete records a deleted change for all environments', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)

    await service.delete('flag-1', 'user-1')

    expect(changes.recordChange).toHaveBeenCalledWith({
      organizationId: 'org-1',
      projectId: 'proj-1',
      environmentIds: 'all',
      changes: flagChange('deleted'),
    })
  })

  it('delete records nothing when the transaction fails', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.$transaction.mockRejectedValue(new Error('x'))

    await expect(service.delete('flag-1', 'user-1')).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('toggle records a toggled change for that environment', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue({ id: 'fe-1' })

    await service.toggle('flag-1', 'env-1', true)

    expect(changes.recordChange).toHaveBeenCalledWith({
      organizationId: 'org-1',
      projectId: 'proj-1',
      environmentIds: ['env-1'],
      changes: flagChange('toggled'),
    })
  })

  it('toggle records a change when it creates the default row', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue(null)
    prisma.flagEnvironment.create.mockResolvedValue({ id: 'fe-new' })

    await service.toggle('flag-1', 'env-1')

    expect(changes.recordChange).toHaveBeenCalledTimes(1)
  })

  it('toggle records nothing when the write fails', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue({ id: 'fe-1' })
    prisma.flagEnvironment.update.mockRejectedValue(new Error('x'))

    await expect(service.toggle('flag-1', 'env-1', true)).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('toggle records nothing for an unknown flag', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(null)

    await expect(service.toggle('missing', 'env-1')).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('updateValue records an updated change for that environment (brand override too)', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue(null)
    prisma.flagEnvironment.create.mockResolvedValue({ id: 'fe-brand' })

    await service.updateValue('flag-1', 'env-2', {
      value: 'true',
      brandId: 'brand-1',
    })

    expect(changes.recordChange).toHaveBeenCalledWith({
      organizationId: 'org-1',
      projectId: 'proj-1',
      environmentIds: ['env-2'],
      changes: flagChange('updated'),
    })
  })

  it('updateValue records a change when updating an existing row', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue({ id: 'fe-1' })
    prisma.flagEnvironment.update.mockResolvedValue({ id: 'fe-1' })

    await service.updateValue('flag-1', 'env-1', { enabled: true })

    expect(changes.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({ environmentIds: ['env-1'] })
    )
  })

  it('updateValue records nothing when the write fails', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue({ id: 'fe-1' })
    prisma.flagEnvironment.update.mockRejectedValue(new Error('x'))

    await expect(
      service.updateValue('flag-1', 'env-1', { enabled: true })
    ).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('updateEnvironment records an updated change for the row environment', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValueOnce({
      id: 'fe-1',
      flagId: 'flag-1',
      environmentId: 'env-1',
    })
    prisma.flagEnvironment.update.mockResolvedValue({ id: 'fe-1' })

    await service.updateEnvironment('flag-1', 'fe-1', { isEnabled: true })

    expect(changes.recordChange).toHaveBeenCalledWith({
      organizationId: 'org-1',
      projectId: 'proj-1',
      environmentIds: ['env-1'],
      changes: flagChange('updated'),
    })
  })

  it('updateEnvironment records nothing when the row is not found', async () => {
    const { service, prisma, changes } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue(null)
    prisma.flagEnvironment.findMany.mockResolvedValue([])

    await expect(
      service.updateEnvironment('flag-1', 'fe-x', { isEnabled: true })
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(changes.recordChange).not.toHaveBeenCalled()
  })
})

describe('FlagsService audit entries for the flag history', () => {
  it('toggle logs a FeatureFlag entry with the acting user', async () => {
    const { service, prisma, auditLogs } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue({
      id: 'fe-1',
      enabled: false,
    })
    prisma.flagEnvironment.update.mockResolvedValue({})

    await service.toggle('flag-1', 'env-1', true, 'user-9')

    expect(auditLogs.create).toHaveBeenCalledWith({
      action: 'flag.toggled',
      entityType: 'FeatureFlag',
      entityId: 'flag-1',
      userId: 'user-9',
      organizationId: 'org-1',
      projectId: 'proj-1',
      oldValues: {
        flagId: 'flag-1',
        flagKey: 'my-flag',
        environmentId: 'env-1',
        enabled: false,
      },
      newValues: {
        flagId: 'flag-1',
        flagKey: 'my-flag',
        environmentId: 'env-1',
        enabled: true,
      },
    })
  })

  it('toggle without a user logs nothing', async () => {
    const { service, prisma, auditLogs } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue({ id: 'fe-1' })
    prisma.flagEnvironment.update.mockResolvedValue({})

    await service.toggle('flag-1', 'env-1', true)
    expect(auditLogs.create).not.toHaveBeenCalled()
  })

  it('updateValue logs old and new value incl. the brand', async () => {
    const { service, prisma, auditLogs } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue({
      ...mockFlag,
      flagType: 'STRING',
    })
    prisma.flagEnvironment.findFirst.mockResolvedValue({
      id: 'fe-b',
      enabled: true,
      defaultValue: 'old',
    })
    prisma.flagEnvironment.update.mockResolvedValue({
      id: 'fe-b',
      enabled: true,
      defaultValue: 'new',
    })

    await service.updateValue(
      'flag-1',
      'env-1',
      { value: 'new', brandId: 'brand-1' },
      'user-9'
    )

    expect(auditLogs.create).toHaveBeenCalledWith({
      action: 'flag.value_updated',
      entityType: 'FeatureFlag',
      entityId: 'flag-1',
      userId: 'user-9',
      organizationId: 'org-1',
      projectId: 'proj-1',
      oldValues: {
        flagId: 'flag-1',
        flagKey: 'my-flag',
        environmentId: 'env-1',
        brandId: 'brand-1',
        enabled: true,
        defaultValue: 'old',
      },
      newValues: {
        flagId: 'flag-1',
        flagKey: 'my-flag',
        environmentId: 'env-1',
        brandId: 'brand-1',
        enabled: true,
        defaultValue: 'new',
      },
    })
  })

  it('updateValue of a new override logs it as inherited before', async () => {
    const { service, prisma, auditLogs } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue({
      ...mockFlag,
      flagType: 'STRING',
    })
    prisma.flagEnvironment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ enabled: false, defaultValue: 'base' })
    prisma.flagEnvironment.create.mockResolvedValue({
      id: 'fe-new',
      enabled: false,
      defaultValue: 'x',
    })

    await service.updateValue(
      'flag-1',
      'env-1',
      { value: 'x', brandId: 'brand-1' },
      'user-9'
    )

    const entry = auditLogs.create.mock.calls[0][0]
    expect(entry.oldValues).toEqual({
      flagId: 'flag-1',
      flagKey: 'my-flag',
      environmentId: 'env-1',
      brandId: 'brand-1',
      inherited: true,
    })
    expect(entry.newValues.defaultValue).toBe('x')
  })

  it('updateEnvironment logs the change', async () => {
    const { service, prisma, auditLogs } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
    prisma.flagEnvironment.findFirst.mockResolvedValue({
      id: 'fe-1',
      environmentId: 'env-1',
      brandId: null,
      enabled: false,
      defaultValue: 'false',
    })
    prisma.flagEnvironment.update.mockResolvedValue({
      id: 'fe-1',
      environmentId: 'env-1',
      brandId: null,
      enabled: true,
      defaultValue: 'true',
    })

    await service.updateEnvironment(
      'flag-1',
      'fe-1',
      { isEnabled: true },
      'user-9'
    )

    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'flag.environment_updated',
        entityType: 'FeatureFlag',
        entityId: 'flag-1',
        userId: 'user-9',
        oldValues: {
          flagId: 'flag-1',
          flagKey: 'my-flag',
          environmentId: 'env-1',
          brandId: null,
          enabled: false,
          defaultValue: 'false',
        },
        newValues: {
          flagId: 'flag-1',
          flagKey: 'my-flag',
          environmentId: 'env-1',
          brandId: null,
          enabled: true,
          defaultValue: 'true',
        },
      })
    )
  })
})
