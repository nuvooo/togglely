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

    it('skips audit log when no userId is provided', async () => {
      const { service, prisma, auditLogs } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)

      await service.delete('flag-1')

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(auditLogs.create).not.toHaveBeenCalled()
    })
  })
})
