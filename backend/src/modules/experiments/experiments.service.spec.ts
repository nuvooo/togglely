import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { ExperimentsService } from './experiments.service'

const mockFlag = {
  id: 'flag-1',
  key: 'test-flag',
  name: 'Test Flag',
  projectId: 'proj-1',
  organizationId: 'org-1',
}

const mockEnvironment = {
  id: 'env-1',
  key: 'production',
  name: 'Production',
}

const mockExperiment = {
  id: 'exp-1',
  key: 'header-test',
  name: 'Header Test',
  description: 'Testing new header',
  hypothesis: 'Will increase conversions',
  status: 'DRAFT',
  flagId: 'flag-1',
  environmentId: 'env-1',
  trafficPercent: 100,
  startedAt: null,
  endedAt: null,
  createdById: 'user-1',
  projectId: 'proj-1',
  organizationId: 'org-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const mockVariant = {
  id: 'var-1',
  experimentId: 'exp-1',
  key: 'control',
  name: 'Control',
  description: 'Current design',
  value: 'A',
  weight: 50,
  isControl: true,
}

const mockVariantB = {
  id: 'var-2',
  experimentId: 'exp-1',
  key: 'treatment',
  name: 'Treatment',
  description: 'New design',
  value: 'B',
  weight: 50,
  isControl: false,
}

function createService() {
  const prisma = {
    featureFlag: { findUnique: jest.fn() },
    environment: { findUnique: jest.fn() },
    experiment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    experimentVariant: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any

  const auditLogs = {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  } as any

  const service = new ExperimentsService(prisma, auditLogs)
  return { service, prisma, auditLogs }
}

describe('ExperimentsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('create', () => {
    const createDto = {
      name: 'Header Test',
      key: 'header-test',
      description: 'Testing new header design',
      hypothesis: 'Will increase conversions by 10%',
      flagId: 'flag-1',
      environmentId: 'env-1',
      trafficPercent: 100,
      variants: [
        {
          key: 'control',
          name: 'Control',
          value: 'A',
          weight: 50,
          isControl: true,
        },
        {
          key: 'treatment',
          name: 'Treatment',
          value: 'B',
          weight: 50,
          isControl: false,
        },
      ],
    }

    it('creates an experiment with embedded variants and writes audit log', async () => {
      const { service, prisma, auditLogs } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.environment.findUnique.mockResolvedValue(mockEnvironment)
      prisma.experiment.findFirst.mockResolvedValue(null)
      prisma.experiment.create.mockResolvedValue(mockExperiment)
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        variants: [mockVariant, mockVariantB],
        flag: mockFlag,
        environment: mockEnvironment,
      })

      const result = await service.create('user-1', createDto)

      expect(prisma.experiment.create).toHaveBeenCalledWith({
        data: {
          name: 'Header Test',
          key: 'header-test',
          description: 'Testing new header design',
          hypothesis: 'Will increase conversions by 10%',
          flag: { connect: { id: 'flag-1' } },
          environment: { connect: { id: 'env-1' } },
          trafficPercent: 100,
          createdBy: { connect: { id: 'user-1' } },
          project: { connect: { id: 'proj-1' } },
          organization: { connect: { id: 'org-1' } },
        },
        include: { variants: true },
      })
      expect(auditLogs.create).toHaveBeenCalledWith({
        action: 'experiment.created',
        entityType: 'Experiment',
        entityId: mockExperiment.id,
        userId: 'user-1',
        organizationId: 'org-1',
        projectId: 'proj-1',
        newValues: { name: 'Header Test', key: 'header-test' },
      })
      expect(result).toBeDefined()
      expect(result!.variants).toHaveLength(2)
    })

    it('creates embedded variants in a loop', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.environment.findUnique.mockResolvedValue(mockEnvironment)
      prisma.experiment.findFirst.mockResolvedValue(null)
      prisma.experiment.create.mockResolvedValue(mockExperiment)
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        variants: [],
      })

      await service.create('user-1', createDto)

      expect(prisma.experimentVariant.create).toHaveBeenCalledTimes(2)
      expect(prisma.experimentVariant.create).toHaveBeenNthCalledWith(1, {
        data: {
          experiment: { connect: { id: 'exp-1' } },
          key: 'control',
          name: 'Control',
          description: undefined,
          value: 'A',
          weight: 50,
          isControl: true,
        },
      })
      expect(prisma.experimentVariant.create).toHaveBeenNthCalledWith(2, {
        data: {
          experiment: { connect: { id: 'exp-1' } },
          key: 'treatment',
          name: 'Treatment',
          description: undefined,
          value: 'B',
          weight: 50,
          isControl: false,
        },
      })
    })

    it('normalizes key to lowercase', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.environment.findUnique.mockResolvedValue(mockEnvironment)
      prisma.experiment.findFirst.mockResolvedValue(null)
      prisma.experiment.create.mockResolvedValue(mockExperiment)

      await service.create('user-1', {
        ...createDto,
        key: '  HEADER-TEST-2  ',
      })

      const createData = prisma.experiment.create.mock.calls[0][0].data
      expect(createData.key).toBe('header-test-2')
    })

    it('throws NotFoundException when flag does not exist', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(null)

      await expect(
        service.create('user-1', createDto)
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws NotFoundException when environment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.environment.findUnique.mockResolvedValue(null)

      await expect(
        service.create('user-1', createDto)
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws ConflictException when active experiment exists for flag+environment', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.environment.findUnique.mockResolvedValue(mockEnvironment)
      prisma.experiment.findFirst.mockResolvedValue(mockExperiment)

      await expect(
        service.create('user-1', createDto)
      ).rejects.toBeInstanceOf(ConflictException)

      expect(prisma.experiment.findFirst).toHaveBeenCalledWith({
        where: {
          flagId: 'flag-1',
          environmentId: 'env-1',
          status: { in: ['RUNNING', 'PAUSED'] },
        },
      })
    })

    it('uses default trafficPercent when not provided', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.environment.findUnique.mockResolvedValue(mockEnvironment)
      prisma.experiment.findFirst.mockResolvedValue(null)
      prisma.experiment.create.mockResolvedValue(mockExperiment)

      await service.create('user-1', {
        name: 'Minimal',
        key: 'minimal',
        flagId: 'flag-1',
        environmentId: 'env-1',
      })

      const createData = prisma.experiment.create.mock.calls[0][0].data
      expect(createData.trafficPercent).toBe(100)
    })

    it('skips variant creation when no variants provided', async () => {
      const { service, prisma } = createService()
      prisma.featureFlag.findUnique.mockResolvedValue(mockFlag)
      prisma.environment.findUnique.mockResolvedValue(mockEnvironment)
      prisma.experiment.findFirst.mockResolvedValue(null)
      prisma.experiment.create.mockResolvedValue(mockExperiment)
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      await service.create('user-1', {
        name: 'No variants',
        key: 'no-variants',
        flagId: 'flag-1',
        environmentId: 'env-1',
      })

      expect(prisma.experimentVariant.create).not.toHaveBeenCalled()
    })
  })

  describe('findAll', () => {
    it('returns experiments for a project', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findMany.mockResolvedValue([mockExperiment])

      const result = await service.findAll('proj-1')

      expect(prisma.experiment.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        include: {
          variants: true,
          flag: true,
          environment: true,
          _count: { select: { events: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      expect(result).toHaveLength(1)
    })

    it('filters by status when provided', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findMany.mockResolvedValue([])

      await service.findAll('proj-1', 'RUNNING')

      expect(prisma.experiment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: 'proj-1', status: 'RUNNING' },
        })
      )
    })

    it('returns empty array when no experiments', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findMany.mockResolvedValue([])

      const result = await service.findAll('proj-1')

      expect(result).toEqual([])
    })
  })

  describe('findOne', () => {
    it('returns an experiment by id', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      const result = await service.findOne('exp-1')

      expect(prisma.experiment.findUnique).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        include: {
          variants: true,
          flag: true,
          environment: true,
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      })
      expect(result).toBeDefined()
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })
  })

  describe('update', () => {
    const updateDto = { name: 'Updated Name', description: 'Updated desc' }

    it('updates an experiment', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
      })
      prisma.experiment.update.mockResolvedValue({
        ...mockExperiment,
        name: 'Updated Name',
      })

      const result = await service.update('exp-1', updateDto)

      expect(prisma.experiment.update).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        data: updateDto,
        include: { variants: true },
      })
      expect(result.name).toBe('Updated Name')
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(
        service.update('missing', updateDto)
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws BadRequestException when experiment is RUNNING', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
      })

      await expect(
        service.update('exp-1', updateDto)
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws BadRequestException when experiment is COMPLETED', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'COMPLETED',
      })

      await expect(
        service.update('exp-1', updateDto)
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('allows updating PAUSED experiments', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'PAUSED',
      })
      prisma.experiment.update.mockResolvedValue(mockExperiment)

      await service.update('exp-1', updateDto)

      expect(prisma.experiment.update).toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('deletes an experiment with transaction and writes audit log', async () => {
      const { service, prisma, auditLogs } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
      })
      prisma.$transaction.mockImplementation(
        (cb: (tx: any) => Promise<any>) => {
          return cb({
            experimentEvent: { deleteMany: jest.fn() },
            experimentVariant: { deleteMany: jest.fn() },
            experiment: { delete: jest.fn().mockResolvedValue({}) },
          })
        }
      )

      await service.delete('exp-1', 'user-1')

      expect(prisma.$transaction).toHaveBeenCalled()
      expect(auditLogs.create).toHaveBeenCalledWith({
        action: 'experiment.deleted',
        entityType: 'Experiment',
        entityId: 'exp-1',
        userId: 'user-1',
        organizationId: 'org-1',
        projectId: 'proj-1',
        oldValues: { name: 'Header Test', key: 'header-test' },
      })
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(service.delete('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('throws BadRequestException when experiment is not DRAFT', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
      })

      await expect(
        service.delete('exp-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('start', () => {
    it('starts a DRAFT experiment with valid variants and writes audit log', async () => {
      const { service, prisma, auditLogs } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
        variants: [mockVariant, mockVariantB],
      })
      prisma.experiment.findFirst.mockResolvedValue(null)
      prisma.experiment.update.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
        startedAt: new Date(),
        variants: [mockVariant, mockVariantB],
      })

      const result = await service.start('exp-1', 'user-1')

      expect(result.status).toBe('RUNNING')
      expect(auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'experiment.started' })
      )
    })

    it('starts a PAUSED experiment', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'PAUSED',
        startedAt: new Date(),
        variants: [mockVariant, mockVariantB],
      })
      prisma.experiment.findFirst.mockResolvedValue(null)
      prisma.experiment.update.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
        variants: [mockVariant, mockVariantB],
      })

      const result = await service.start('exp-1', 'user-1')

      expect(result.status).toBe('RUNNING')
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(service.start('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('throws BadRequestException when experiment is COMPLETED', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'COMPLETED',
        variants: [mockVariant, mockVariantB],
      })

      await expect(
        service.start('exp-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws BadRequestException when fewer than 2 variants', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
        variants: [mockVariant],
      })

      await expect(
        service.start('exp-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws BadRequestException when no control variant', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
        variants: [
          { ...mockVariant, isControl: false },
          mockVariantB,
        ],
      })

      await expect(
        service.start('exp-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws BadRequestException when multiple controls', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
        variants: [
          mockVariant,
          { ...mockVariantB, isControl: true },
        ],
      })

      await expect(
        service.start('exp-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws BadRequestException when weights do not sum to 100', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
        variants: [
          { ...mockVariant, weight: 60 },
          { ...mockVariantB, weight: 30 },
        ],
      })

      await expect(
        service.start('exp-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws ConflictException when another experiment is running for same flag+environment', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
        variants: [mockVariant, mockVariantB],
      })
      prisma.experiment.findFirst.mockResolvedValue({
        id: 'exp-2',
        status: 'RUNNING',
      })

      await expect(
        service.start('exp-1', 'user-1')
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('preserves existing startedAt when restarting', async () => {
      const existingStartedAt = new Date('2026-01-15')
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'PAUSED',
        startedAt: existingStartedAt,
        variants: [mockVariant, mockVariantB],
      })
      prisma.experiment.findFirst.mockResolvedValue(null)
      prisma.experiment.update.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
        variants: [mockVariant, mockVariantB],
      })

      await service.start('exp-1', 'user-1')

      const updateData = prisma.experiment.update.mock.calls[0][0].data
      expect(updateData.startedAt).toBe(existingStartedAt)
    })
  })

  describe('pause', () => {
    it('pauses a RUNNING experiment and writes audit log', async () => {
      const { service, prisma, auditLogs } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
      })
      prisma.experiment.update.mockResolvedValue({
        ...mockExperiment,
        status: 'PAUSED',
        variants: [mockVariant, mockVariantB],
      })

      const result = await service.pause('exp-1', 'user-1')

      expect(result.status).toBe('PAUSED')
      expect(auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'experiment.paused' })
      )
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(service.pause('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('throws BadRequestException when experiment is not RUNNING', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
      })

      await expect(
        service.pause('exp-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('complete', () => {
    it('completes a RUNNING experiment and writes audit log', async () => {
      const { service, prisma, auditLogs } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
      })
      prisma.experiment.update.mockResolvedValue({
        ...mockExperiment,
        status: 'COMPLETED',
        endedAt: new Date(),
        variants: [mockVariant, mockVariantB],
      })

      const result = await service.complete('exp-1', 'user-1')

      expect(result.status).toBe('COMPLETED')
      expect(auditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'experiment.completed' })
      )
    })

    it('completes a PAUSED experiment', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'PAUSED',
      })
      prisma.experiment.update.mockResolvedValue({
        ...mockExperiment,
        status: 'COMPLETED',
        endedAt: new Date(),
        variants: [mockVariant, mockVariantB],
      })

      const result = await service.complete('exp-1', 'user-1')

      expect(result.status).toBe('COMPLETED')
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(
        service.complete('missing', 'user-1')
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws BadRequestException when experiment is DRAFT', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
      })

      await expect(
        service.complete('exp-1', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('sets endedAt when completing', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
      })
      prisma.experiment.update.mockResolvedValue({
        ...mockExperiment,
        status: 'COMPLETED',
        variants: [mockVariant, mockVariantB],
      })

      await service.complete('exp-1', 'user-1')

      const updateData = prisma.experiment.update.mock.calls[0][0].data
      expect(updateData.endedAt).toBeInstanceOf(Date)
    })
  })

  describe('addVariant', () => {
    const variantDto = {
      key: 'treatment',
      name: 'Treatment',
      description: 'New design',
      value: 'B',
      weight: 50,
      isControl: false,
    }

    it('adds a variant to a DRAFT experiment', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
      })
      prisma.experimentVariant.create.mockResolvedValue(mockVariantB)

      const result = await service.addVariant('exp-1', variantDto)

      expect(prisma.experimentVariant.create).toHaveBeenCalledWith({
        data: {
          experiment: { connect: { id: 'exp-1' } },
          key: 'treatment',
          name: 'Treatment',
          description: 'New design',
          value: 'B',
          weight: 50,
          isControl: false,
        },
      })
      expect(result).toBeDefined()
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(
        service.addVariant('missing', variantDto)
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws BadRequestException when experiment is not DRAFT', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
      })

      await expect(
        service.addVariant('exp-1', variantDto)
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('updateVariant', () => {
    it('updates a variant in a DRAFT experiment', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
      })
      prisma.experimentVariant.findFirst.mockResolvedValue(mockVariant)
      prisma.experimentVariant.update.mockResolvedValue({
        ...mockVariant,
        weight: 75,
      })

      const result = await service.updateVariant('exp-1', 'var-1', {
        weight: 75,
      })

      expect(prisma.experimentVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: { weight: 75 },
      })
      expect(result.weight).toBe(75)
    })

    it('updates a variant in a PAUSED experiment', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'PAUSED',
      })
      prisma.experimentVariant.findFirst.mockResolvedValue(mockVariant)
      prisma.experimentVariant.update.mockResolvedValue(mockVariant)

      await service.updateVariant('exp-1', 'var-1', { name: 'Updated' })

      expect(prisma.experimentVariant.update).toHaveBeenCalled()
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(
        service.updateVariant('missing', 'var-1', { name: 'New' })
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws BadRequestException when experiment is RUNNING', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
      })

      await expect(
        service.updateVariant('exp-1', 'var-1', { name: 'New' })
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws NotFoundException when variant does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
      })
      prisma.experimentVariant.findFirst.mockResolvedValue(null)

      await expect(
        service.updateVariant('exp-1', 'missing-var', { name: 'New' })
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('deleteVariant', () => {
    it('deletes a variant from a DRAFT experiment', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
      })
      prisma.experimentVariant.findFirst.mockResolvedValue(mockVariant)

      await service.deleteVariant('exp-1', 'var-1')

      expect(prisma.experimentVariant.delete).toHaveBeenCalledWith({
        where: { id: 'var-1' },
      })
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(
        service.deleteVariant('missing', 'var-1')
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws BadRequestException when experiment is not DRAFT', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'RUNNING',
      })

      await expect(
        service.deleteVariant('exp-1', 'var-1')
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws NotFoundException when variant does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        status: 'DRAFT',
      })
      prisma.experimentVariant.findFirst.mockResolvedValue(null)

      await expect(
        service.deleteVariant('exp-1', 'missing-var')
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
