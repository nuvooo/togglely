import { NotFoundException } from '@nestjs/common'
import { BrandsService } from './brands.service'

const mockBrand = {
  id: 'brand-1',
  name: 'Brand A',
  key: 'brand-a',
  description: 'Test brand',
  projectId: 'proj-1',
}

const mockFlag = {
  id: 'flag-1',
  key: 'my-flag',
  name: 'My Flag',
  flagType: 'BOOLEAN',
  projectId: 'proj-1',
}

function createService() {
  const prisma = {
    brand: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    featureFlag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    environment: {
      findMany: jest.fn(),
    },
    flagEnvironment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as any

  const auditLogs = { create: jest.fn() } as any
  const service = new BrandsService(prisma, auditLogs)
  return { service, prisma, auditLogs }
}

describe('BrandsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('findByProject', () => {
    it('returns brands for a project', async () => {
      const { service, prisma } = createService()
      prisma.brand.findMany.mockResolvedValue([mockBrand])

      const result = await service.findByProject('proj-1')

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Brand A')
    })
  })

  describe('findFlagsForBrand', () => {
    it('returns flags with environment states for a brand', async () => {
      const { service, prisma } = createService()
      prisma.brand.findUnique.mockResolvedValue(mockBrand)
      prisma.featureFlag.findMany.mockResolvedValue([mockFlag])
      prisma.environment.findMany.mockResolvedValue([
        { id: 'env-1', name: 'Production' },
      ])
      prisma.flagEnvironment.findMany.mockResolvedValue([
        {
          flagId: 'flag-1',
          environmentId: 'env-1',
          brandId: null,
          enabled: true,
          defaultValue: 'true',
        },
      ])

      const result = await service.findFlagsForBrand('brand-1')

      expect(result.brand.id).toBe('brand-1')
      expect(result.flags).toHaveLength(1)
      expect(result.flags[0].environments).toHaveLength(1)
      expect(result.flags[0].environments[0].enabled).toBe(true)
      expect(result.flags[0].environments[0].isBrandSpecific).toBe(false)
      expect(prisma.environment.findMany).toHaveBeenCalledWith({
        where: { projectId: mockBrand.projectId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
    })

    it('throws when brand is not found', async () => {
      const { service, prisma } = createService()
      prisma.brand.findUnique.mockResolvedValue(null)

      await expect(service.findFlagsForBrand('missing')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('uses brand-specific override when available', async () => {
      const { service, prisma } = createService()
      prisma.brand.findUnique.mockResolvedValue(mockBrand)
      prisma.featureFlag.findMany.mockResolvedValue([mockFlag])
      prisma.environment.findMany.mockResolvedValue([
        { id: 'env-1', name: 'Production' },
      ])
      prisma.flagEnvironment.findMany.mockResolvedValue([
        {
          flagId: 'flag-1',
          environmentId: 'env-1',
          brandId: null,
          enabled: false,
          defaultValue: 'false',
        },
        {
          flagId: 'flag-1',
          environmentId: 'env-1',
          brandId: 'brand-1',
          enabled: true,
          defaultValue: 'true',
        },
      ])

      const result = await service.findFlagsForBrand('brand-1')

      expect(result.flags[0].environments[0].enabled).toBe(true)
      expect(result.flags[0].environments[0].isBrandSpecific).toBe(true)
    })
  })

  describe('create', () => {
    it('creates a new brand', async () => {
      const { service, prisma } = createService()
      prisma.brand.create.mockResolvedValue(mockBrand)

      const result = await service.create('proj-1', {
        name: 'Brand A',
        key: 'brand-a',
        description: 'Test brand',
      })

      expect(result.name).toBe('Brand A')
      expect(prisma.brand.create).toHaveBeenCalledWith({
        data: {
          name: 'Brand A',
          key: 'brand-a',
          description: 'Test brand',
          projectId: 'proj-1',
        },
      })
    })
  })

  describe('update', () => {
    it('updates the brand', async () => {
      const { service, prisma } = createService()
      prisma.brand.update.mockResolvedValue({
        ...mockBrand,
        name: 'Updated Brand',
      })

      const result = await service.update('brand-1', { name: 'Updated Brand' })

      expect(result.name).toBe('Updated Brand')
    })

    it('only forwards whitelisted fields to prisma', async () => {
      const { service, prisma } = createService()
      prisma.brand.update.mockResolvedValue(mockBrand)

      await service.update('brand-1', {
        name: 'Renamed',
        projectId: 'other-project',
        key: 'hijacked',
      } as any)

      expect(prisma.brand.update).toHaveBeenCalledWith({
        where: { id: 'brand-1' },
        data: { name: 'Renamed' },
      })
    })
  })

  describe('delete', () => {
    it('deletes flag environments and then the brand', async () => {
      const { service, prisma } = createService()
      prisma.flagEnvironment.deleteMany.mockResolvedValue({ count: 2 })
      prisma.brand.delete.mockResolvedValue({})

      await service.delete('brand-1')

      expect(prisma.flagEnvironment.deleteMany).toHaveBeenCalledWith({
        where: { brandId: 'brand-1' },
      })
      expect(prisma.brand.delete).toHaveBeenCalledWith({
        where: { id: 'brand-1' },
      })
    })
  })

  describe('toggleFlag', () => {
    it('toggles an existing flag environment', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.flagEnvironment.findFirst.mockResolvedValue({
        id: 'fe-1',
        enabled: false,
      })
      prisma.flagEnvironment.update.mockResolvedValue({
        id: 'fe-1',
        enabled: true,
      })

      const result = await service.toggleFlag(
        'brand-1',
        'flag-1',
        'env-1',
        undefined
      )

      expect(result.enabled).toBe(true)
      expect(prisma.flagEnvironment.update).toHaveBeenCalledWith({
        where: { id: 'fe-1' },
        data: { enabled: true, defaultValue: 'true' },
      })
    })

    it('creates a new flag environment when none exists', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.flagEnvironment.findFirst.mockResolvedValue(null)
      prisma.flagEnvironment.create.mockResolvedValue({
        id: 'fe-new',
        enabled: true,
      })

      const result = await service.toggleFlag(
        'brand-1',
        'flag-1',
        'env-1',
        true
      )

      expect(result.enabled).toBe(true)
      expect(prisma.flagEnvironment.create).toHaveBeenCalledWith({
        data: {
          flagId: 'flag-1',
          environmentId: 'env-1',
          brandId: 'brand-1',
          enabled: true,
          defaultValue: 'true',
        },
      })
    })

    it('throws when flag is not found', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(null)

      await expect(
        service.toggleFlag('brand-1', 'missing', 'env-1', true)
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('sets explicit enabled value when provided', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.flagEnvironment.findFirst.mockResolvedValue({
        id: 'fe-1',
        enabled: true,
      })
      prisma.flagEnvironment.update.mockResolvedValue({
        id: 'fe-1',
        enabled: false,
      })

      await service.toggleFlag('brand-1', 'flag-1', 'env-1', false)

      expect(prisma.flagEnvironment.update).toHaveBeenCalledWith({
        where: { id: 'fe-1' },
        data: { enabled: false, defaultValue: 'false' },
      })
    })

    it('handles P2002 duplicate error on create by updating', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.flagEnvironment.findFirst
        .mockResolvedValueOnce(null) // brand row
        .mockResolvedValueOnce(null) // environment default
        .mockResolvedValueOnce({ id: 'fe-dup' })
      prisma.flagEnvironment.create.mockRejectedValue({ code: 'P2002' })
      prisma.flagEnvironment.update.mockResolvedValue({
        id: 'fe-dup',
        enabled: true,
      })

      const result = await service.toggleFlag(
        'brand-1',
        'flag-1',
        'env-1',
        true
      )

      expect(result.enabled).toBe(true)
      expect(prisma.flagEnvironment.update).toHaveBeenCalledWith({
        where: { id: 'fe-dup' },
        data: { enabled: true },
      })
    })
  })
})

describe('BrandsService inheritance', () => {
  it('findFlagsForBrand marks inherited brands and returns the default', async () => {
    const { service, prisma } = createService()
    prisma.brand.findUnique.mockResolvedValue(mockBrand)
    prisma.featureFlag.findMany.mockResolvedValue([
      { ...mockFlag, flagType: 'STRING' },
    ])
    prisma.environment.findMany.mockResolvedValue([
      { id: 'env-1', name: 'Dev' },
      { id: 'env-2', name: 'Prod' },
    ])
    prisma.flagEnvironment.findMany.mockResolvedValue([
      {
        id: 'd1',
        flagId: 'flag-1',
        environmentId: 'env-1',
        brandId: null,
        enabled: true,
        defaultValue: 'blue',
      },
      {
        id: 'd2',
        flagId: 'flag-1',
        environmentId: 'env-2',
        brandId: null,
        enabled: true,
        defaultValue: 'blue',
      },
      {
        id: 'b2',
        flagId: 'flag-1',
        environmentId: 'env-2',
        brandId: 'brand-1',
        enabled: false,
        defaultValue: 'red',
      },
    ])

    const result = await service.findFlagsForBrand('brand-1')
    const [dev, prod] = result.flags[0].environments

    expect(dev).toEqual(
      expect.objectContaining({
        enabled: true,
        defaultValue: 'blue',
        inherited: true,
        isBrandSpecific: false,
        default: { enabled: true, defaultValue: 'blue' },
      })
    )
    expect(prod).toEqual(
      expect.objectContaining({
        enabled: false,
        defaultValue: 'red',
        inherited: false,
        isBrandSpecific: true,
        default: { enabled: true, defaultValue: 'blue' },
      })
    )
    expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
  })

  it('toggling an inheriting brand creates an override seeded from the default', async () => {
    const { service, prisma, auditLogs } = createService()
    prisma.featureFlag.findUnique.mockResolvedValue({
      ...mockFlag,
      flagType: 'STRING',
      organizationId: 'org-1',
    })
    prisma.flagEnvironment.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.brandId === null
          ? { id: 'd1', enabled: true, defaultValue: 'blue' }
          : null
      )
    )
    prisma.flagEnvironment.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'b1', ...data })
    )

    await service.toggleFlag('brand-1', 'flag-1', 'env-1', undefined, 'user-1')

    expect(prisma.flagEnvironment.create).toHaveBeenCalledWith({
      data: {
        flagId: 'flag-1',
        environmentId: 'env-1',
        brandId: 'brand-1',
        enabled: false,
        defaultValue: 'blue',
      },
    })
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'flag.brand_toggled' })
    )
  })
})
