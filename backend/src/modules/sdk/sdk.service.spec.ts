import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { SdkService } from './sdk.service'
import { EvaluationService } from './evaluation.service'
import { HashingService } from './hashing.service'

const mockProject = {
  id: 'proj-1',
  key: 'my-project',
  type: 'SINGLE',
  organizationId: 'org-1',
  allowedOrigins: [] as string[],
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
  id: 'key-1',
  organizationId: 'org-1',
  environmentId: null as string | null,
}

function createService() {
  const prisma = {
    apiKey: {
      findFirst: jest.fn(),
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
    experiment: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    experimentEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
  } as any

  const evaluationService = new EvaluationService()
  const hashingService = new HashingService()
  const service = new SdkService(prisma, evaluationService, hashingService)
  return { service, prisma, evaluationService, hashingService }
}

function mockValidAccess(
  prisma: any,
  project: any = mockProject,
  environment: any = mockEnvironment
) {
  prisma.apiKey.findFirst.mockResolvedValue(mockApiKey)
  prisma.project.findFirst.mockResolvedValue(project)
  prisma.environment.findFirst.mockResolvedValue(environment)
}

describe('SdkService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('resolveSdkAccess', () => {
    it('looks up an active, non-expired key and scopes project/env lookups', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma)

      const access = await service.resolveSdkAccess(
        'my-project',
        'production',
        'test-api-key'
      )

      expect(access).toEqual({
        organizationId: 'org-1',
        apiKeyId: 'key-1',
        project: mockProject,
        environment: mockEnvironment,
      })

      const keyWhere = prisma.apiKey.findFirst.mock.calls[0][0].where
      expect(keyWhere.key).toBe('test-api-key')
      expect(keyWhere.isActive).toBe(true)
      expect(keyWhere.OR).toEqual(
        expect.arrayContaining([
          { expiresAt: null },
          { expiresAt: { gt: expect.any(Date) } },
        ])
      )

      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', key: 'my-project' },
      })
      expect(prisma.environment.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', key: 'production' },
      })
    })

    it('rejects non-string api keys before reaching Prisma', async () => {
      const { service, prisma } = createService()

      await expect(
        service.resolveSdkAccess('my-project', 'production', {
          $ne: null,
        } as any)
      ).rejects.toBeInstanceOf(UnauthorizedException)
      await expect(
        service.resolveSdkAccess('my-project', 'production', '')
      ).rejects.toBeInstanceOf(UnauthorizedException)
      await expect(
        service.resolveSdkAccess('my-project', 'production', 'x'.repeat(1000))
      ).rejects.toBeInstanceOf(UnauthorizedException)

      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled()
    })

    it('rejects expired or inactive keys (not found by the filtered query)', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue(null)

      await expect(
        service.resolveSdkAccess('my-project', 'production', 'expired-key')
      ).rejects.toBeInstanceOf(UnauthorizedException)
      expect(prisma.project.findFirst).not.toHaveBeenCalled()
    })

    it('rejects a key bound to a different environment', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma)
      prisma.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        environmentId: 'env-other',
      })

      await expect(
        service.resolveSdkAccess('my-project', 'production', 'test-api-key')
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('accepts a key bound to the requested environment', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma)
      prisma.apiKey.findFirst.mockResolvedValue({
        ...mockApiKey,
        environmentId: 'env-1',
      })

      await expect(
        service.resolveSdkAccess('my-project', 'production', 'test-api-key')
      ).resolves.toMatchObject({ environment: mockEnvironment })
    })

    it('rejects look-alike origins for wildcard entries', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma, {
        ...mockProject,
        allowedOrigins: ['*.example.com'],
      })

      await expect(
        service.resolveSdkAccess(
          'my-project',
          'production',
          'test-api-key',
          'https://evilexample.com'
        )
      ).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('cross-tenant isolation', () => {
    // Two organizations both own a project with key "shared". The attacker's
    // API key belongs to org-attacker; it must never resolve the victim's
    // project, environment or flags.
    const victimProject = {
      ...mockProject,
      id: 'proj-victim',
      key: 'shared',
      organizationId: 'org-victim',
    }
    const attackerProject = {
      ...mockProject,
      id: 'proj-attacker',
      key: 'shared',
      organizationId: 'org-attacker',
    }
    const projects = [victimProject, attackerProject]
    const environments = [
      { ...mockEnvironment, id: 'env-victim', projectId: 'proj-victim' },
      { ...mockEnvironment, id: 'env-attacker', projectId: 'proj-attacker' },
    ]
    const flags = [
      {
        ...mockFlag,
        id: 'flag-victim',
        key: 'secret',
        projectId: 'proj-victim',
      },
    ]

    function createMultiTenantService() {
      const ctx = createService()
      const { prisma } = ctx
      const matches = (row: any, where: any) =>
        Object.entries(where).every(([k, v]) => row[k] === v)

      prisma.apiKey.findFirst.mockImplementation(async ({ where }: any) =>
        where.key === 'attacker-key'
          ? {
              id: 'key-attacker',
              organizationId: 'org-attacker',
              environmentId: null,
            }
          : null
      )
      prisma.project.findFirst.mockImplementation(
        async ({ where }: any) =>
          projects.find((p) => matches(p, where)) ?? null
      )
      prisma.environment.findFirst.mockImplementation(
        async ({ where }: any) =>
          environments.find((e) => matches(e, where)) ?? null
      )
      prisma.featureFlag.findFirst.mockImplementation(
        async ({ where }: any) => flags.find((f) => matches(f, where)) ?? null
      )
      prisma.featureFlag.findMany.mockImplementation(async ({ where }: any) =>
        flags.filter((f) => matches(f, where))
      )
      prisma.flagEnvironment.findFirst.mockImplementation(
        async ({ where }: any) =>
          where.flagId === 'flag-victim'
            ? { enabled: true, defaultValue: 'true', targetingRules: [] }
            : null
      )
      prisma.flagEnvironment.findMany.mockResolvedValue([])
      prisma.flagEnvironment.create.mockImplementation(
        async ({ data }: any) => ({
          ...data,
          targetingRules: [],
        })
      )
      return ctx
    }

    it('evaluateFlag resolves only the attacker org project', async () => {
      const { service, prisma } = createMultiTenantService()

      const result = await service.evaluateFlag(
        'shared',
        'production',
        'secret',
        'attacker-key'
      )

      expect(result).toEqual({
        value: false,
        enabled: false,
        flagType: 'BOOLEAN',
      })
      for (const [args] of prisma.project.findFirst.mock.calls) {
        expect(args.where.organizationId).toBe('org-attacker')
      }
      for (const [args] of prisma.featureFlag.findFirst.mock.calls) {
        expect(args.where.projectId).toBe('proj-attacker')
      }
    })

    it('getAllFlags never returns flags of the victim project', async () => {
      const { service, prisma } = createMultiTenantService()

      const result = await service.getAllFlags(
        'shared',
        'production',
        'attacker-key'
      )

      expect(result).toEqual({})
      for (const [args] of prisma.featureFlag.findMany.mock.calls) {
        expect(args.where.projectId).toBe('proj-attacker')
      }
      for (const [args] of prisma.flagEnvironment.findMany.mock.calls) {
        expect(args.where.environmentId).toBe('env-attacker')
      }
    })
  })

  describe('evaluateFlag', () => {
    it('returns flag value for valid request', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma)
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
      expect(prisma.featureFlag.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', key: 'my-flag' },
      })
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

    it('throws Unauthorized when project is not in the key organization', async () => {
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
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('throws when environment not found', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma, mockProject, null)

      await expect(
        service.evaluateFlag('my-project', 'staging', 'my-flag', 'test-api-key')
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('returns disabled when flag not found', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma)
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
      mockValidAccess(prisma)
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
      mockValidAccess(prisma, {
        ...mockProject,
        allowedOrigins: ['https://example.com'],
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
      mockValidAccess(prisma, multiProject)
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
      expect(prisma.brand.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', key: 'brand-a' },
      })
      expect(
        prisma.flagEnvironment.findFirst.mock.calls[0][0].where.brandId
      ).toBe('brand-1')
    })

    it('does not query brand by id for non-ObjectId brand keys', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma, { ...mockProject, type: 'MULTI' })
      prisma.featureFlag.findFirst.mockResolvedValue(mockFlag)
      prisma.brand.findFirst.mockResolvedValue(null)
      prisma.flagEnvironment.findFirst.mockResolvedValue({
        enabled: false,
        defaultValue: 'false',
        targetingRules: [],
      })

      await service.evaluateFlag(
        'my-project',
        'production',
        'my-flag',
        'test-api-key',
        'not-an-object-id'
      )

      expect(prisma.brand.findFirst).toHaveBeenCalledTimes(1)
      expect(
        prisma.flagEnvironment.findFirst.mock.calls[0][0].where.brandId
      ).toBeNull()
    })

    it('falls back to brand id lookup (scoped to project) for ObjectId brand keys', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma, { ...mockProject, type: 'MULTI' })
      prisma.featureFlag.findFirst.mockResolvedValue(mockFlag)
      const brandId = '507f1f77bcf86cd799439011'
      prisma.brand.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: brandId, key: 'brand-a' })
      prisma.flagEnvironment.findFirst.mockResolvedValue({
        enabled: true,
        defaultValue: 'true',
        targetingRules: [],
      })

      await service.evaluateFlag(
        'my-project',
        'production',
        'my-flag',
        'test-api-key',
        brandId
      )

      expect(prisma.brand.findFirst).toHaveBeenLastCalledWith({
        where: { projectId: 'proj-1', id: brandId },
      })
    })
  })

  describe('getAllFlags', () => {
    it('validates API key then returns all flags', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma)
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

      const result = await service.getAllFlags(
        'my-project',
        'production',
        'test-api-key'
      )

      expect(prisma.apiKey.findFirst).toHaveBeenCalled()
      expect(result['my-flag']).toBeDefined()
      expect(result['my-flag'].enabled).toBe(true)
    })

    it('throws when API key is invalid', async () => {
      const { service, prisma } = createService()
      prisma.apiKey.findFirst.mockResolvedValue(null)

      await expect(
        service.getAllFlags('my-project', 'production', 'bad')
      ).rejects.toBeInstanceOf(UnauthorizedException)
      expect(prisma.featureFlag.findMany).not.toHaveBeenCalled()
    })

    it('throws when environment not found', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma, mockProject, null)

      await expect(
        service.getAllFlags('my-project', 'missing', 'test-api-key')
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('auto-creates flag environment when missing and no brand', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma)
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

      const result = await service.getAllFlags(
        'my-project',
        'production',
        'test-api-key'
      )

      expect(prisma.flagEnvironment.create).toHaveBeenCalled()
      expect(result['my-flag'].enabled).toBe(false)
    })
  })

  describe('brand inheritance', () => {
    const multiProject = { ...mockProject, type: 'MULTI' }
    const stringFlag = { ...mockFlag, flagType: 'STRING' }
    const defaultRow = (enabled: boolean, defaultValue: string) => ({
      id: 'fe-default',
      flagId: 'flag-1',
      environmentId: 'env-1',
      brandId: null,
      enabled,
      defaultValue,
      targetingRules: [],
    })
    const brandRow = (enabled: boolean, defaultValue: string) => ({
      id: 'fe-brand',
      flagId: 'flag-1',
      environmentId: 'env-1',
      brandId: 'brand-1',
      enabled,
      defaultValue,
      targetingRules: [],
    })

    function setupBrand(prisma: any) {
      mockValidAccess(prisma, multiProject)
      prisma.brand.findFirst.mockResolvedValue({ id: 'brand-1', key: 'b' })
    }

    /** findFirst mock that answers per brandId like the real query. */
    function rowsByBrand(prisma: any, rows: any[]) {
      prisma.flagEnvironment.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          rows.find((r) => r.brandId === (where.brandId ?? null)) ?? null
        )
      )
    }

    it('evaluateFlag: brand without row inherits the default and creates nothing', async () => {
      const { service, prisma } = createService()
      setupBrand(prisma)
      prisma.featureFlag.findFirst.mockResolvedValue(stringFlag)
      rowsByBrand(prisma, [defaultRow(true, 'blue')])

      const result = await service.evaluateFlag(
        'my-project',
        'production',
        'my-flag',
        'k',
        'b'
      )

      expect(result.enabled).toBe(true)
      expect(result.value).toBe('blue')
      expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
    })

    it('evaluateFlag: brand override wins over the default', async () => {
      const { service, prisma } = createService()
      setupBrand(prisma)
      prisma.featureFlag.findFirst.mockResolvedValue(stringFlag)
      rowsByBrand(prisma, [defaultRow(true, 'blue'), brandRow(true, 'red')])

      const result = await service.evaluateFlag(
        'my-project',
        'production',
        'my-flag',
        'k',
        'b'
      )

      expect(result.value).toBe('red')
      expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
    })

    it('evaluateFlag: a default change is reflected live for inheriting brands', async () => {
      const { service, prisma } = createService()
      setupBrand(prisma)
      prisma.featureFlag.findFirst.mockResolvedValue(mockFlag)
      const rows = [defaultRow(false, 'false')]
      rowsByBrand(prisma, rows)

      const before = await service.evaluateFlag(
        'my-project',
        'production',
        'my-flag',
        'k',
        'b'
      )
      rows[0] = defaultRow(true, 'true')
      const after = await service.evaluateFlag(
        'my-project',
        'production',
        'my-flag',
        'k',
        'b'
      )

      expect(before.enabled).toBe(false)
      expect(after.enabled).toBe(true)
      expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
    })

    it('evaluateFlag: creates only the default row when nothing exists', async () => {
      const { service, prisma } = createService()
      setupBrand(prisma)
      prisma.featureFlag.findFirst.mockResolvedValue(mockFlag)
      rowsByBrand(prisma, [])
      prisma.flagEnvironment.create.mockResolvedValue(defaultRow(false, 'false'))

      await service.evaluateFlag('my-project', 'production', 'my-flag', 'k', 'b')

      expect(prisma.flagEnvironment.create).toHaveBeenCalledTimes(1)
      expect(prisma.flagEnvironment.create.mock.calls[0][0].data.brandId).toBe(
        null
      )
    })

    it('getAllFlags: brand without row inherits the default and creates nothing', async () => {
      const { service, prisma } = createService()
      setupBrand(prisma)
      prisma.featureFlag.findMany.mockResolvedValue([stringFlag])
      prisma.flagEnvironment.findMany.mockResolvedValue([
        defaultRow(true, 'blue'),
      ])

      const result = await service.getAllFlags(
        'my-project',
        'production',
        'k',
        'b'
      )

      expect(result['my-flag'].enabled).toBe(true)
      expect(result['my-flag'].value).toBe('blue')
      expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
    })

    it('getAllFlags: brand override wins and default changes do not leak into it', async () => {
      const { service, prisma } = createService()
      setupBrand(prisma)
      prisma.featureFlag.findMany.mockResolvedValue([stringFlag])
      prisma.flagEnvironment.findMany.mockResolvedValue([
        defaultRow(true, 'blue'),
        brandRow(false, 'red'),
      ])

      const result = await service.getAllFlags(
        'my-project',
        'production',
        'k',
        'b'
      )

      expect(result['my-flag'].enabled).toBe(false)
      expect(result['my-flag'].value).toBe('red')
      expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
    })

    it('getAllFlags: creates only the default row when nothing exists', async () => {
      const { service, prisma } = createService()
      setupBrand(prisma)
      prisma.featureFlag.findMany.mockResolvedValue([mockFlag])
      prisma.flagEnvironment.findMany.mockResolvedValue([])
      prisma.flagEnvironment.create.mockResolvedValue(defaultRow(false, 'false'))

      await service.getAllFlags('my-project', 'production', 'k', 'b')

      expect(prisma.flagEnvironment.create).toHaveBeenCalledTimes(1)
      expect(prisma.flagEnvironment.create.mock.calls[0][0].data.brandId).toBe(
        null
      )
    })
  })

  describe('resolveSdkAccess key type', () => {
    it('returns the API key type (used for stream limits)', async () => {
      const { service, prisma } = createService()
      mockValidAccess(prisma)
      prisma.apiKey.findFirst.mockResolvedValue({ ...mockApiKey, type: 'CLIENT' })

      const access = await service.resolveSdkAccess('my-project', 'production', 'k')

      expect(access.apiKeyType).toBe('CLIENT')
      expect(prisma.apiKey.findFirst.mock.calls[0][0].select).toMatchObject({
        type: true,
      })
    })
  })

  describe('trackExposuresForAccess (304 path)', () => {
    const access = {
      organizationId: 'org-1',
      apiKeyId: 'key-1',
      apiKeyType: 'SERVER',
      project: mockProject,
      environment: mockEnvironment,
    } as any
    const experiment = {
      id: 'exp-1',
      key: 'exp',
      flagId: 'flag-1',
      trafficPercent: 100,
      variants: [
        { id: 'v1', key: 'a', value: 'A', weight: 50 },
        { id: 'v2', key: 'b', value: 'B', weight: 50 },
      ],
    }

    function setup() {
      const ctx = createService()
      ctx.prisma.experiment.findMany = jest.fn().mockResolvedValue([experiment])
      ctx.prisma.flagEnvironment.findMany.mockResolvedValue([
        { flagId: 'flag-1', brandId: null, enabled: true },
      ])
      return ctx
    }

    it('does nothing without a userId', async () => {
      const { service, prisma } = setup()
      await service.trackExposuresForAccess(access, undefined, {})
      expect(prisma.experiment.findMany).not.toHaveBeenCalled()
      expect(prisma.experimentEvent.create).not.toHaveBeenCalled()
    })

    it('records one exposure per running experiment with the same assignment as evaluation', async () => {
      const { service, prisma, hashingService } = setup()
      await service.trackExposuresForAccess(access, undefined, { userId: 'u1' })

      expect(prisma.experiment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            environmentId: 'env-1',
            status: 'RUNNING',
          }),
        })
      )
      const variant = hashingService.assignVariant('exp-1', 'u1', experiment.variants as any)
      expect(prisma.experimentEvent.create).toHaveBeenCalledTimes(1)
      expect(prisma.experimentEvent.create).toHaveBeenCalledWith({
        data: {
          experiment: { connect: { id: 'exp-1' } },
          variant: { connect: { id: (variant as any).id } },
          type: 'EXPOSURE',
          userId: 'u1',
        },
      })
    })

    it('skips experiments whose flag is disabled in the environment', async () => {
      const { service, prisma } = setup()
      prisma.flagEnvironment.findMany.mockResolvedValue([
        { flagId: 'flag-1', brandId: null, enabled: false },
      ])
      await service.trackExposuresForAccess(access, undefined, { userId: 'u1' })
      expect(prisma.experimentEvent.create).not.toHaveBeenCalled()
    })

    it('skips users outside the traffic allocation', async () => {
      const { service, prisma } = setup()
      prisma.experiment.findMany.mockResolvedValue([{ ...experiment, trafficPercent: 0 }])
      await service.trackExposuresForAccess(access, undefined, { userId: 'u1' })
      expect(prisma.experimentEvent.create).not.toHaveBeenCalled()
    })

    it('limits tracking to the requested flag for single-flag requests', async () => {
      const { service, prisma } = setup()
      await service.trackExposuresForAccess(access, undefined, { userId: 'u1' }, 'my-flag')
      expect(prisma.experiment.findMany.mock.calls[0][0].where).toMatchObject({
        flag: { key: 'my-flag', projectId: 'proj-1' },
      })
    })

    it('uses only the first running experiment per flag, like evaluation', async () => {
      const { service, prisma } = setup()
      prisma.experiment.findMany.mockResolvedValue([
        experiment,
        { ...experiment, id: 'exp-2', key: 'exp2' },
      ])
      await service.trackExposuresForAccess(access, undefined, { userId: 'u1' })
      expect(prisma.experimentEvent.create).toHaveBeenCalledTimes(1)
    })
  })
})
