import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { ProjectsService } from './projects.service'

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

  const service = new ProjectsService(prisma)
  return { service, prisma, txMock }
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
                expect.objectContaining({ key: 'development' }),
                expect.objectContaining({ key: 'production' }),
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
        include: { environments: true },
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
        include: { environments: true },
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
