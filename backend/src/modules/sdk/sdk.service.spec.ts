import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { SdkService } from './sdk.service'
import { EvaluationService } from './evaluation.service'

const mockProject = {
  id: 'proj-1',
  key: 'my-project',
  type: 'SINGLE',
  organizationId: 'org-1',
  allowedOrigins: [],
}

const mockEnvironment = {
  id: 'env-1',
  key: 'production',
  name: 'Production',
  projectId: 'proj-1',
}

const mockFlag = {
  id: 'flag-1',
  key: 'my-flag',
  name: 'My Flag',
  flagType: 'BOOLEAN',
  projectId: 'proj-1',
}

const mockApiKey = {
  key: 'test-api-key',
  isActive: true,
  organizationId: 'org-1',
  organization: {
    projects: [mockProject],
  },
}

function createService() {
  const prisma = {
    apiKey: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    project: {
      findFirst: jest.fn(),
    },
    environment: {
      findFirst: jest.fn(),
    },
    featureFlag: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    flagEnvironment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    brand: {
      findFirst: jest.fn(),
    },
  } as any

  const evaluationService = new EvaluationService()
  const service = new SdkService(prisma, evaluationService)
  return { service, prisma, evaluationService }
}

describe('SdkService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('evaluateFlag', () => {
    it('returns flag value for valid request', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue(mockApiKey)
      prisma.project.findFirst.mockResolvedValue(mockProject)
      prisma.environment.findFirst.mockResolvedValue(mockEnvironment)
      prisma.featureFlag.findFirst.mockResolvedValue(mockFlag)
      prisma.flagEnvironment.findFirst.mockResolvedValue({
        enabled: true,
        defaultValue: 'true',
        targetingRules: [],
      })

      const result = await service.evaluateFlag(
        'my-project',
        'production',
        'my-flag',
        'test-api-key'
      )

      expect(result.enabled).toBe(true)
    })

    it('throws when API key is invalid', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue(null)

      await expect(
        service.evaluateFlag(
          'my-project',
          'production',
          'my-flag',
          'invalid-key'
        )
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('throws when project not found for API key', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        organization: { projects: [] },
      })

      await expect(
        service.evaluateFlag(
          'my-project',
          'production',
          'my-flag',
          'test-api-key'
        )
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('throws when project not found in database', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue(mockApiKey)
      prisma.project.findFirst.mockResolvedValue(null)

      await expect(
        service.evaluateFlag(
          'my-project',
          'production',
          'my-flag',
          'test-api-key'
        )
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws when environment not found', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue(mockApiKey)
      prisma.project.findFirst.mockResolvedValue(mockProject)
      prisma.environment.findFirst.mockResolvedValue(null)

      await expect(
        service.evaluateFlag(
          'my-project',
          'staging',
          'my-flag',
          'test-api-key'
        )
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('returns disabled when flag not found', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue(mockApiKey)
      prisma.project.findFirst.mockResolvedValue(mockProject)
      prisma.environment.findFirst.mockResolvedValue(mockEnvironment)
      prisma.featureFlag.findFirst.mockResolvedValue(null)

      const result = await service.evaluateFlag(
        'my-project',
        'production',
        'unknown-flag',
        'test-api-key'
      )

      expect(result.enabled).toBe(false)
      expect(result.value).toBe(false)
    })

    it('auto-creates flag environment if missing', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue(mockApiKey)
      prisma.project.findFirst.mockResolvedValue(mockProject)
      prisma.environment.findFirst.mockResolvedValue(mockEnvironment)
      prisma.featureFlag.findFirst.mockResolvedValue(mockFlag)
      prisma.flagEnvironment.findFirst.mockResolvedValue(null)
      prisma.flagEnvironment.create.mockResolvedValue({
        enabled: false,
        defaultValue: 'false',
        targetingRules: [],
      })

      const result = await service.evaluateFlag(
        'my-project',
        'production',
        'my-flag',
        'test-api-key'
      )

      expect(prisma.flagEnvironment.create).toHaveBeenCalled()
      expect(result.enabled).toBe(false)
    })

    it('throws ForbiddenException when origin is not allowed', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        organization: {
          projects: [
            { ...mockProject, allowedOrigins: ['https://example.com'] },
          ],
        },
      })

      await expect(
        service.evaluateFlag(
          'my-project',
          'production',
          'my-flag',
          'test-api-key',
          undefined,
          'https://evil.com'
        )
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('resolves brand for MULTI project', async () => {
      const { service, prisma } = createService()
      const multiProject = { ...mockProject, type: 'MULTI' }
      prisma.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        organization: { projects: [multiProject] },
      })
      prisma.project.findFirst.mockResolvedValue(multiProject)
      prisma.environment.findFirst.mockResolvedValue(mockEnvironment)
      prisma.featureFlag.findFirst.mockResolvedValue(mockFlag)
      prisma.brand.findFirst.mockResolvedValueOnce({
        id: 'brand-1',
        key: 'brand-a',
      })
      prisma.flagEnvironment.findFirst.mockResolvedValue({
        enabled: true,
        defaultValue: 'true',
        targetingRules: [],
      })

      const result = await service.evaluateFlag(
        'my-project',
        'production',
        'my-flag',
        'test-api-key',
        'brand-a'
      )

      expect(result.enabled).toBe(true)
      expect(prisma.brand.findFirst).toHaveBeenCalled()
    })
  })

  describe('evaluateAllFlags', () => {
    it('returns all flags for a project/environment', async () => {
      const { service, prisma } = createService()
      prisma.project.findFirst.mockResolvedValue(mockProject)
      prisma.environment.findFirst.mockResolvedValue(mockEnvironment)
      prisma.featureFlag.findMany.mockResolvedValue([mockFlag])
      prisma.flagEnvironment.findMany.mockResolvedValue([
        {
          flagId: 'flag-1',
          environmentId: 'env-1',
          brandId: null,
          enabled: true,
          defaultValue: 'true',
          targetingRules: [],
        },
      ])

      const result = await service.evaluateAllFlags('my-project', 'production')

      expect(result['my-flag']).toBeDefined()
      expect(result['my-flag'].enabled).toBe(true)
    })

    it('throws when project not found', async () => {
      const { service, prisma } = createService()
      prisma.project.findFirst.mockResolvedValue(null)

      await expect(
        service.evaluateAllFlags('missing', 'production')
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws when environment not found', async () => {
      const { service, prisma } = createService()
      prisma.project.findFirst.mockResolvedValue(mockProject)
      prisma.environment.findFirst.mockResolvedValue(null)

      await expect(
        service.evaluateAllFlags('my-project', 'missing')
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('auto-creates flag environment when missing and no brand', async () => {
      const { service, prisma } = createService()
      prisma.project.findFirst.mockResolvedValue(mockProject)
      prisma.environment.findFirst.mockResolvedValue(mockEnvironment)
      prisma.featureFlag.findMany.mockResolvedValue([mockFlag])
      prisma.flagEnvironment.findMany.mockResolvedValue([])
      prisma.flagEnvironment.create.mockResolvedValue({
        flagId: 'flag-1',
        environmentId: 'env-1',
        brandId: null,
        enabled: false,
        defaultValue: 'false',
        targetingRules: [],
      })

      const result = await service.evaluateAllFlags('my-project', 'production')

      expect(prisma.flagEnvironment.create).toHaveBeenCalled()
      expect(result['my-flag'].enabled).toBe(false)
    })
  })

  describe('getAllFlags', () => {
    it('validates API key then returns all flags', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue(mockApiKey)
      prisma.project.findFirst.mockResolvedValue(mockProject)
      prisma.environment.findFirst.mockResolvedValue(mockEnvironment)
      prisma.featureFlag.findMany.mockResolvedValue([])
      prisma.flagEnvironment.findMany.mockResolvedValue([])

      const result = await service.getAllFlags(
        'my-project',
        'production',
        'test-api-key'
      )

      expect(result).toEqual({})
      expect(prisma.apiKey.findFirst).toHaveBeenCalled()
    })
  })

  describe('validateApiKey', () => {
    it('returns true for valid API key', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findMany.mockResolvedValue([
        { key: 'test-api-key', organization: { projects: [mockProject] } },
      ])

      const result = await service.validateApiKey('test-api-key', 'my-project')

      expect(result).toBe(true)
    })

    it('returns false for invalid API key', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findMany.mockResolvedValue([
        { key: 'other-key', organization: { projects: [mockProject] } },
      ])

      const result = await service.validateApiKey('wrong-key', 'my-project')

      expect(result).toBe(false)
    })
  })
})
