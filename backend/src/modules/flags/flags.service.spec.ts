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

  const service = new FlagsService(prisma, auditLogs)
  return { service, prisma, auditLogs, txMock }
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
