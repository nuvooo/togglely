import { migrateFlagWideRules } from './flag-wide-rules.migration'

const FLAG = 'flag1'
const DEV = 'env-dev'
const PROD = 'env-prod'
const ACME = 'brand-acme'

interface Row {
  id: string
  flagId: string
  environmentId: string
  brandId: string | null
}

function setup(
  rows: Row[],
  legacyRules: { id: string; flagEnvId: string; priority: number }[],
  existingFlagWideMax: number | null = null,
  claimed = 1
) {
  const prisma: any = {
    targetingRule: {
      findMany: jest.fn().mockResolvedValue(legacyRules),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          existingFlagWideMax === null
            ? null
            : { priority: existingFlagWideMax }
        ),
      updateMany: jest.fn().mockResolvedValue({ count: claimed }),
    },
    flagEnvironment: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  }
  const logger = { log: jest.fn() }
  return { prisma, logger }
}

const updates = (prisma: any) =>
  Object.fromEntries(
    prisma.targetingRule.updateMany.mock.calls.map(([arg]: any) => [
      arg.where.id,
      arg.data,
    ])
  )

describe('migrateFlagWideRules', () => {
  it('does nothing without legacy rules', async () => {
    const { prisma, logger } = setup([], [])
    await expect(migrateFlagWideRules(prisma, logger)).resolves.toBe(0)
    expect(prisma.targetingRule.updateMany).not.toHaveBeenCalled()
  })

  it('scopes environment rules to their environment', async () => {
    const { prisma, logger } = setup(
      [
        { id: 'fe-dev', flagId: FLAG, environmentId: DEV, brandId: null },
        { id: 'fe-prod', flagId: FLAG, environmentId: PROD, brandId: null },
      ],
      [
        { id: 'r-dev', flagEnvId: 'fe-dev', priority: 0 },
        { id: 'r-prod', flagEnvId: 'fe-prod', priority: 0 },
      ]
    )
    await expect(migrateFlagWideRules(prisma, logger)).resolves.toBe(2)
    const data = updates(prisma)
    expect(data['r-dev']).toEqual(
      expect.objectContaining({
        flagId: FLAG,
        flagEnvId: null,
        environmentIds: [DEV],
        environmentsExcluded: false,
        brandIds: [],
        brandsExcluded: false,
      })
    )
    expect(data['r-prod'].environmentIds).toEqual([PROD])
  })

  it('keeps brand rules first and excludes those brands from environment rules', async () => {
    const { prisma, logger } = setup(
      [
        { id: 'fe-dev', flagId: FLAG, environmentId: DEV, brandId: null },
        { id: 'fe-acme', flagId: FLAG, environmentId: DEV, brandId: ACME },
      ],
      [
        { id: 'r-env-2', flagEnvId: 'fe-dev', priority: 2 },
        { id: 'r-env-1', flagEnvId: 'fe-dev', priority: 1 },
        { id: 'r-acme', flagEnvId: 'fe-acme', priority: 0 },
      ]
    )
    await migrateFlagWideRules(prisma, logger)
    const data = updates(prisma)
    expect(data['r-acme']).toEqual(
      expect.objectContaining({
        environmentIds: [DEV],
        brandIds: [ACME],
        brandsExcluded: false,
        priority: 0,
      })
    )
    // Environment rules did not apply to brands with own rules before
    expect(data['r-env-1']).toEqual(
      expect.objectContaining({
        environmentIds: [DEV],
        brandIds: [ACME],
        brandsExcluded: true,
        priority: 1,
      })
    )
    expect(data['r-env-2'].priority).toBe(2)
  })

  it('appends after existing flag-wide rules', async () => {
    const { prisma, logger } = setup(
      [{ id: 'fe-dev', flagId: FLAG, environmentId: DEV, brandId: null }],
      [{ id: 'r-dev', flagEnvId: 'fe-dev', priority: 0 }],
      7
    )
    await migrateFlagWideRules(prisma, logger)
    expect(updates(prisma)['r-dev'].priority).toBe(8)
  })

  it('only updates rules that are still unmigrated', async () => {
    const { prisma, logger } = setup(
      [{ id: 'fe-dev', flagId: FLAG, environmentId: DEV, brandId: null }],
      [{ id: 'r-dev', flagEnvId: 'fe-dev', priority: 0 }],
      null,
      0
    )
    await expect(migrateFlagWideRules(prisma, logger)).resolves.toBe(0)
    expect(prisma.targetingRule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r-dev', flagEnvId: 'fe-dev' },
      })
    )
  })

  it('skips rules whose row no longer exists', async () => {
    const { prisma, logger } = setup(
      [],
      [{ id: 'orphan', flagEnvId: 'gone', priority: 0 }]
    )
    await expect(migrateFlagWideRules(prisma, logger)).resolves.toBe(0)
    expect(prisma.targetingRule.updateMany).not.toHaveBeenCalled()
  })
})
