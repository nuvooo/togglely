import { EnvironmentsService } from './environments.service'

function createService() {
  const prisma = {
    environment: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    flagEnvironment: {
      deleteMany: jest.fn(),
    },
  } as any

  const service = new EnvironmentsService(prisma)
  return { service, prisma }
}

describe('EnvironmentsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('findByProject', () => {
    it('returns environments for a project', async () => {
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
    it('creates a new environment', async () => {
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
        },
      })
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
})
