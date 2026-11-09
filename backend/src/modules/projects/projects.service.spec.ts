import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { ProjectsService } from './projects.service'

const ENV_ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }]

const mockProject = {
  id: 'proj-1',
  name: 'Test Project',
  key: 'test-project',
  description: 'A test project',
  type: 'SINGLE',
  allowedOrigins: [],
  organizationId: 'org-1',
  environments: [
    { id: 'env-1', name: 'Development', key: 'development' },
    { id: 'env-2', name: 'Production', key: 'production' },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createService() {
  const txMock = {
    featureFlag: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    flagEnvironment: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    environment: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    brand: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    project: {
      delete: jest.fn().mockResolvedValue({}),
    },
    configVersion: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    webhook: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    webhookDelivery: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  }

  const prisma = {
    project: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    organizationMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    featureFlag: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    flagEnvironment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    environment: {
      findMany: jest.fn(),
    },
    brand: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((cb: any) => cb(txMock)),
  } as any

  const changes = {
    recordChange: jest.fn().mockResolvedValue(undefined),
  } as any

  const service = new ProjectsService(prisma, changes)
  return { service, prisma, txMock, changes }
}

describe('ProjectsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('findAll', () => {
    it('returns projects with counts for a user', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([
        {
          organization: {
            projects: [mockProject],
          },
        },
      ])
      prisma.featureFlag.count.mockResolvedValue(5)

      const result = await service.findAll('user-1')

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test Project')
      expect(result[0].flagCount).toBe(5)
      expect(result[0].environmentCount).toBe(2)
    })

    it('returns empty when user has no memberships', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([])

      const result = await service.findAll('user-1')

      expect(result).toHaveLength(0)
    })
  })

  describe('findOne', () => {
    it('returns the project with flag count', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.featureFlag.count.mockResolvedValue(3)

      const result = await service.findOne('proj-1')

      expect(result.id).toBe('proj-1')
      expect(result.flagCount).toBe(3)
    })

    it('throws when project is not found', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(null)

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })
  })

  describe('create', () => {
    it('creates a project with default environments', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      })
      prisma.project.findUnique.mockResolvedValue(null)
      prisma.project.create.mockResolvedValue({
        ...mockProject,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await service.create('org-1', 'user-1', {
        name: 'Test Project',
        key: 'test-project',
      } as any)

      expect(result).toBeDefined()
      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Project',
            key: 'test-project',
            environments: {
              create: expect.arrayContaining([
                expect.objectContaining({ key: 'development', sortOrder: 0 }),
                expect.objectContaining({ key: 'production', sortOrder: 1 }),
              ]),
            },
          }),
        })
      )
    })

    it('throws when user has no permission', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findFirst.mockResolvedValue(null)

      await expect(
        service.create('org-1', 'user-1', {
          name: 'Test',
          key: 'test',
        } as any)
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws when project key already exists', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      })
      prisma.project.findUnique.mockResolvedValue(mockProject)

      await expect(
        service.create('org-1', 'user-1', {
          name: 'Test',
          key: 'test-project',
        } as any)
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('normalizes the project key to lowercase', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ADMIN',
      })
      prisma.project.findUnique.mockResolvedValue(null)
      prisma.project.create.mockResolvedValue({
        ...mockProject,
        key: 'my-project',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await service.create('org-1', 'user-1', {
        name: 'My Project',
        key: '  MY-PROJECT  ',
      } as any)

      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_key: {
            organizationId: 'org-1',
            key: 'my-project',
          },
        },
      })
    })
  })

  describe('update', () => {
    it('updates the project and returns with environments', async () => {
      const { service, prisma } = createService()
      prisma.project.update.mockResolvedValue({
        ...mockProject,
        name: 'Updated Name',
      })

      const result = await service.update('proj-1', { name: 'Updated Name' })

      expect(result.name).toBe('Updated Name')
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: { name: 'Updated Name' },
        include: { environments: { orderBy: ENV_ORDER } },
      })
    })

    it('ignores organizationId, key and other non-whitelisted fields', async () => {
      const { service, prisma } = createService()
      prisma.project.update.mockResolvedValue(mockProject)

      await service.update('proj-1', {
        name: 'Renamed',
        description: 'desc',
        type: 'MULTI',
        allowedOrigins: ['https://example.com'],
        organizationId: 'attacker-org',
        key: 'hijacked',
        id: 'other-id',
      } as any)

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: {
          name: 'Renamed',
          description: 'desc',
          type: 'MULTI',
          allowedOrigins: ['https://example.com'],
        },
        include: { environments: { orderBy: ENV_ORDER } },
      })
    })
  })

  describe('delete', () => {
    it('deletes the project with all dependencies in a transaction', async () => {
      const { service, prisma, txMock } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      })

      await service.delete('proj-1', 'user-1')

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(txMock.project.delete).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
      })
    })

    it('throws when project is not found', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(null)

      await expect(service.delete('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('throws when user has no permission to delete', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.organizationMember.findFirst.mockResolvedValue(null)

      await expect(service.delete('proj-1', 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException
      )
    })
  })

  describe('exportFlags', () => {
    it('exports flags with environments', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.featureFlag.findMany.mockResolvedValue([
        {
          key: 'flag-1',
          name: 'Flag One',
          description: 'Test flag',
          flagType: 'BOOLEAN' as const,
          flagEnvironments: [
            {
              brandId: null,
              environment: { key: 'development' },
              enabled: true,
              defaultValue: 'true',
            },
          ],
        },
      ])

      const result = await service.exportFlags('proj-1')

      expect(result.version).toBe('1.0')
      expect(result.flags).toHaveLength(1)
      expect(result.flags[0].key).toBe('flag-1')
      expect(result.flags[0].environments).toHaveLength(1)
    })

    it('throws when project is not found', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(null)

      await expect(service.exportFlags('missing')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })
  })

  describe('importFlags', () => {
    it('imports new flags', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      })
      prisma.featureFlag.findFirst.mockResolvedValue(null)
      prisma.featureFlag.create.mockResolvedValue({ id: 'new-flag' })
      prisma.flagEnvironment.findFirst.mockResolvedValue(null)
      prisma.flagEnvironment.create.mockResolvedValue({})

      const flags = [
        {
          key: 'new-flag',
          name: 'New Flag',
          description: 'Imported',
          flagType: 'BOOLEAN' as const,
          environments: [
            {
              environmentKey: 'development',
              enabled: true,
              defaultValue: 'true',
            },
          ],
        },
      ]

      const result = await service.importFlags('proj-1', 'user-1', flags)

      expect(result.imported).toBe(1)
      expect(result.skipped).toBe(0)
    })

    it('skips existing flags when skipExisting is true', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.organizationMember.findFirst.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      })
      prisma.featureFlag.findFirst.mockResolvedValue({ id: 'existing-flag' })

      const flags = [
        { key: 'existing', name: 'Existing', flagType: 'BOOLEAN' as const },
      ]

      const result = await service.importFlags('proj-1', 'user-1', flags, {
        skipExisting: true,
      })

      expect(result.skipped).toBe(1)
      expect(result.imported).toBe(0)
    })

    it('throws when user has no permission', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(mockProject)
      prisma.organizationMember.findFirst.mockResolvedValue(null)

      await expect(
        service.importFlags('proj-1', 'user-1', [])
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws when project is not found', async () => {
      const { service, prisma } = createService()
      prisma.project.findUnique.mockResolvedValue(null)

      await expect(
        service.importFlags('missing', 'user-1', [])
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('findByOrganization', () => {
    it('returns projects for an organization', async () => {
      const { service, prisma } = createService()
      prisma.project.findMany.mockResolvedValue([mockProject])
      prisma.featureFlag.count.mockResolvedValue(2)

      const result = await service.findByOrganization('org-1')

      expect(result).toHaveLength(1)
      expect(result[0].flagCount).toBe(2)
    })
  })
})

describe('ProjectsService.getFlagsWithBrands (brand inheritance)', () => {
  it('returns createdAt and the latest updatedAt (including brand rows)', async () => {
    const { service, prisma } = createService()
    prisma.project.findUnique.mockResolvedValue({
      ...mockProject,
      type: 'MULTI',
      environments: [{ id: 'env-1', name: 'Development', key: 'development' }],
    })
    prisma.featureFlag.findMany.mockResolvedValue([
      {
        id: 'flag-1',
        name: 'Color',
        key: 'color',
        flagType: 'STRING',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
        flagEnvironments: [
          {
            id: 'fe-default',
            environmentId: 'env-1',
            brandId: null,
            enabled: true,
            defaultValue: 'blue',
            updatedAt: new Date('2024-01-03T00:00:00Z'),
            environment: { name: 'Development' },
          },
          {
            id: 'fe-b1',
            environmentId: 'env-1',
            brandId: 'brand-1',
            enabled: true,
            defaultValue: 'red',
            updatedAt: new Date('2024-04-01T00:00:00Z'),
            environment: { name: 'Development' },
          },
        ],
      },
    ])
    prisma.brand.findMany.mockResolvedValue([
      { id: 'brand-1', name: 'Alpha', key: 'alpha' },
    ])

    const result = await service.getFlagsWithBrands('proj-1')

    expect(result.flags[0].createdAt).toEqual(new Date('2024-01-01T00:00:00Z'))
    expect(result.flags[0].updatedAt).toEqual(new Date('2024-04-01T00:00:00Z'))
  })

  it('marks brands without own row as inherited with the default values and creates nothing', async () => {
    const { service, prisma } = createService()
    prisma.project.findUnique.mockResolvedValue({
      ...mockProject,
      type: 'MULTI',
      environments: [{ id: 'env-1', name: 'Development', key: 'development' }],
    })
    const flags = [
      {
        id: 'flag-1',
        name: 'Color',
        key: 'color',
        flagType: 'STRING',
        flagEnvironments: [
          {
            id: 'fe-default',
            environmentId: 'env-1',
            brandId: null,
            enabled: true,
            defaultValue: 'blue',
            environment: { name: 'Development' },
          },
          {
            id: 'fe-b2',
            environmentId: 'env-1',
            brandId: 'brand-2',
            enabled: false,
            defaultValue: 'red',
            environment: { name: 'Development' },
          },
        ],
      },
    ]
    prisma.featureFlag.findMany.mockResolvedValue(flags)
    prisma.brand.findMany.mockResolvedValue([
      { id: 'brand-1', name: 'Alpha', key: 'alpha' },
      { id: 'brand-2', name: 'Beta', key: 'beta' },
    ])

    const result = await service.getFlagsWithBrands('proj-1')
    const env = result.flags[0].environments[0]

    expect(env.enabled).toBe(true)
    expect(env.defaultValue).toBe('blue')
    expect(env.brandValues[0]).toEqual(
      expect.objectContaining({
        brandId: 'brand-1',
        brandName: 'Alpha',
        enabled: true,
        defaultValue: 'blue',
        inherited: true,
        isBrandSpecific: false,
      })
    )
    expect(env.brandValues[1]).toEqual(
      expect.objectContaining({
        brandId: 'brand-2',
        enabled: false,
        defaultValue: 'red',
        inherited: false,
        isBrandSpecific: true,
      })
    )
    expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
  })
})

describe('ProjectsService (environment order)', () => {
  const ordered = { environments: { orderBy: ENV_ORDER } }

  it('lists environments by sortOrder in every project read', async () => {
    const { service, prisma } = createService()
    prisma.organizationMember.findMany.mockResolvedValue([
      { organization: { projects: [mockProject] } },
    ])
    prisma.project.findUnique.mockResolvedValue(mockProject)
    prisma.project.findMany.mockResolvedValue([mockProject])
    prisma.featureFlag.count.mockResolvedValue(0)
    prisma.featureFlag.findMany.mockResolvedValue([])
    prisma.brand.findMany.mockResolvedValue([])
    prisma.environment.findMany.mockResolvedValue([])

    await service.findAll('user-1')
    expect(prisma.organizationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          organization: { include: { projects: { include: ordered } } },
        },
      })
    )

    await service.findOne('proj-1')
    await service.getFlagsWithBrands('proj-1')
    await service.exportFlags('proj-1')
    for (const call of prisma.project.findUnique.mock.calls) {
      expect(call[0].include).toEqual(ordered)
    }

    await service.findByOrganization('org-1')
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      include: ordered,
    })

    await service.getEnvironments('proj-1')
    expect(prisma.environment.findMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1' },
      orderBy: ENV_ORDER,
    })
  })

  it('returns flag environments in the project environment order (flags-with-brands)', async () => {
    const { service, prisma } = createService()
    prisma.project.findUnique.mockResolvedValue({
      ...mockProject,
      // persisted order: production before development
      environments: [
        { id: 'env-2', name: 'Production', key: 'production' },
        { id: 'env-1', name: 'Development', key: 'development' },
      ],
    })
    const fe = (environmentId: string, name: string) => ({
      id: `fe-${environmentId}`,
      environmentId,
      brandId: null,
      enabled: false,
      defaultValue: 'false',
      environment: { name },
    })
    prisma.featureFlag.findMany.mockResolvedValue([
      {
        id: 'flag-1',
        name: 'F',
        key: 'f',
        flagType: 'BOOLEAN',
        flagEnvironments: [
          fe('env-1', 'Development'),
          fe('env-2', 'Production'),
        ],
      },
    ])
    prisma.brand.findMany.mockResolvedValue([])

    const result = await service.getFlagsWithBrands('proj-1')

    expect(result.flags[0].environments.map((e) => e.environmentId)).toEqual([
      'env-2',
      'env-1',
    ])
  })

  it('exports environments in persisted order', async () => {
    const { service, prisma } = createService()
    prisma.project.findUnique.mockResolvedValue({
      ...mockProject,
      environments: [
        { id: 'env-2', name: 'Production', key: 'production' },
        { id: 'env-1', name: 'Development', key: 'development' },
      ],
    })
    prisma.featureFlag.findMany.mockResolvedValue([
      {
        key: 'f',
        name: 'F',
        flagType: 'BOOLEAN',
        flagEnvironments: [
          {
            environmentId: 'env-1',
            brandId: null,
            environment: { key: 'development' },
          },
          {
            environmentId: 'env-2',
            brandId: null,
            environment: { key: 'production' },
          },
        ],
      },
    ])

    const result = await service.exportFlags('proj-1')

    expect(result.environments.map((e) => e.key)).toEqual([
      'production',
      'development',
    ])
    expect(result.flags[0].environments.map((e) => e.environmentKey)).toEqual([
      'production',
      'development',
    ])
  })
})

describe('ProjectsService change notifications', () => {
  const admin = { userId: 'user-1', organizationId: 'org-1', role: 'OWNER' }
  const importFlag = (key: string) => ({
    key,
    name: key,
    flagType: 'BOOLEAN' as const,
    environments: [
      { environmentKey: 'development', enabled: true, defaultValue: 'true' },
    ],
  })

  it('delete removes config versions, webhooks and deliveries of the project', async () => {
    const { service, prisma, txMock, changes } = createService()
    prisma.project.findUnique.mockResolvedValue(mockProject)
    prisma.organizationMember.findFirst.mockResolvedValue(admin)
    txMock.webhook.findMany.mockResolvedValue([{ id: 'wh-1' }])

    await service.delete('proj-1', 'user-1')

    expect(txMock.configVersion.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1' },
    })
    expect(txMock.webhookDelivery.deleteMany).toHaveBeenCalledWith({
      where: { webhookId: { in: ['wh-1'] } },
    })
    expect(txMock.webhook.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1' },
    })
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('importFlags records one imported change per written flag for all environments', async () => {
    const { service, prisma, changes } = createService()
    prisma.project.findUnique.mockResolvedValue(mockProject)
    prisma.organizationMember.findFirst.mockResolvedValue(admin)
    prisma.featureFlag.findFirst.mockResolvedValue(null)
    prisma.featureFlag.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `id-${data.key}` })
    )
    prisma.flagEnvironment.findFirst.mockResolvedValue(null)
    prisma.flagEnvironment.create.mockResolvedValue({})

    await service.importFlags('proj-1', 'user-1', [
      importFlag('a'),
      importFlag('b'),
    ])

    expect(changes.recordChange).toHaveBeenCalledTimes(1)
    expect(changes.recordChange).toHaveBeenCalledWith({
      organizationId: 'org-1',
      projectId: 'proj-1',
      environmentIds: 'all',
      changes: [
        { flagKey: 'a', action: 'imported' },
        { flagKey: 'b', action: 'imported' },
      ],
    })
  })

  it('importFlags records a flag that was written before a later step failed', async () => {
    const { service, prisma, changes } = createService()
    prisma.project.findUnique.mockResolvedValue(mockProject)
    prisma.organizationMember.findFirst.mockResolvedValue(admin)
    prisma.featureFlag.findFirst.mockResolvedValue(null)
    prisma.featureFlag.create.mockResolvedValue({ id: 'flag-a' })
    prisma.flagEnvironment.findFirst.mockRejectedValue(new Error('db down'))

    const result = await service.importFlags('proj-1', 'user-1', [
      importFlag('a'),
    ])

    expect(result.errors).toHaveLength(1)
    expect(changes.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [{ flagKey: 'a', action: 'imported' }],
      })
    )
  })

  it('importFlags records nothing when every flag was skipped or failed', async () => {
    const { service, prisma, changes } = createService()
    prisma.project.findUnique.mockResolvedValue(mockProject)
    prisma.organizationMember.findFirst.mockResolvedValue(admin)
    prisma.featureFlag.findFirst.mockResolvedValueOnce({ id: 'existing' })
    prisma.featureFlag.findFirst.mockResolvedValueOnce(null)
    prisma.featureFlag.create.mockRejectedValue(new Error('db down'))

    await service.importFlags(
      'proj-1',
      'user-1',
      [importFlag('existing'), importFlag('broken')],
      { skipExisting: true }
    )

    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('importFlags records nothing without permission', async () => {
    const { service, prisma, changes } = createService()
    prisma.project.findUnique.mockResolvedValue(mockProject)
    prisma.organizationMember.findFirst.mockResolvedValue(null)

    await expect(
      service.importFlags('proj-1', 'user-1', [importFlag('a')])
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(changes.recordChange).not.toHaveBeenCalled()
  })
})
