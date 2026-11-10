import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import {
  CreateTargetingRuleDto,
  UpdateTargetingRuleDto,
} from './dto/targeting-rule.dto'
import { TargetingRulesController } from './targeting-rules.controller'
import { TargetingRulesService } from './targeting-rules.service'

const USER = '64a000000000000000000001'
const ORG = '64a000000000000000000010'
const PROJECT = '64a000000000000000000020'
const OTHER_PROJECT = '64a000000000000000000021'
const FLAG = '64a000000000000000000030'
const ENV = '64a000000000000000000040'
const FLAG_ENV = '64a000000000000000000050'
const RULE = '64a000000000000000000060'
const BRAND = '64a000000000000000000070'
const BRAND_FLAG_ENV = '64a000000000000000000051'
const BRAND_RULE = '64a000000000000000000061'

type Role = 'VIEWER' | 'MEMBER' | 'ADMIN' | 'OWNER' | null

function storedRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE,
    name: 'DE users',
    operator: 'AND',
    serveValue: 'true',
    priority: 0,
    isDefault: false,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    flagEnvironment: { environmentId: ENV, brandId: null },
    conditions: [
      { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
    ],
    ...overrides,
  }
}

function setup(
  role: Role,
  opts: {
    envProject?: string
    flagType?: string
    ruleOfFlag?: boolean
    brandProject?: string
    /** The brand-level FlagEnvironment row of BRAND exists */
    brandRow?: boolean
    /** The brand row has own rules */
    brandRules?: boolean
  } = {}
) {
  const envProject = opts.envProject ?? PROJECT
  const brandProject = opts.brandProject ?? PROJECT
  const prisma: any = {
    project: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: PROJECT, organizationId: ORG }),
    },
    featureFlag: {
      findUnique: jest.fn().mockImplementation(({ select }: any) =>
        Promise.resolve(
          select?.flagType
            ? { flagType: opts.flagType ?? 'BOOLEAN' }
            : {
                id: FLAG,
                key: 'my-flag',
                projectId: PROJECT,
                organizationId: ORG,
              }
        )
      ),
    },
    organizationMember: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          role ? { userId: USER, organizationId: ORG, role } : null
        ),
    },
    environment: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            where.projectId === envProject ? { id: where.id } : null
          )
        ),
    },
    brand: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            where.projectId === brandProject ? { id: where.id } : null
          )
        ),
    },
    flagEnvironment: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.brandId
            ? opts.brandRow
              ? { id: BRAND_FLAG_ENV }
              : null
            : { id: FLAG_ENV, enabled: true, defaultValue: 'true' }
        )
      ),
      create: jest
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ id: data.brandId ? BRAND_FLAG_ENV : FLAG_ENV })
        ),
    },
    targetingRule: {
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        if (where.flagEnvironment?.brandId) {
          return Promise.resolve(
            opts.brandRules
              ? [
                  storedRule({
                    id: BRAND_RULE,
                    flagEnvironment: { environmentId: ENV, brandId: BRAND },
                  }),
                ]
              : []
          )
        }
        if (where.flagEnvId) {
          return Promise.resolve(opts.brandRules ? [{ id: BRAND_RULE }] : [])
        }
        return Promise.resolve([storedRule()])
      }),
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.flagEnvironment) {
          return Promise.resolve(
            opts.ruleOfFlag === false ? null : storedRule()
          )
        }
        return Promise.resolve({ priority: 4 })
      }),
      create: jest
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve(storedRule({ priority: data.priority }))
        ),
      update: jest.fn().mockResolvedValue(storedRule({ enabled: false })),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ruleCondition: {
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest
      .fn()
      .mockImplementation((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg)
      ),
  }
  const auditLogs = { create: jest.fn().mockResolvedValue({}) } as any
  const changes = {
    recordChange: jest.fn().mockResolvedValue(undefined),
  } as any
  const service = new TargetingRulesService(prisma, auditLogs, changes)
  const controller = new TargetingRulesController(
    service,
    new AccessService(prisma)
  )
  return {
    controller,
    prisma,
    auditLogs,
    changes,
    req: { user: { userId: USER } },
  }
}

const createDto = (
  overrides: Partial<CreateTargetingRuleDto> = {}
): CreateTargetingRuleDto => ({
  environmentId: ENV,
  name: 'DE users',
  serveValue: 'true',
  conditions: [{ attribute: 'country', operator: 'EQUALS', value: 'DE' }],
  ...overrides,
})

describe('TargetingRulesController access', () => {
  it('lets a VIEWER read rules in the API shape', async () => {
    const { controller, req } = setup('VIEWER')
    const result = await controller.findAll(FLAG, req, ENV)
    expect(result.rules[0]).toMatchObject({
      id: RULE,
      environmentId: ENV,
      brandId: null,
      enabled: true,
      conditions: [{ attribute: 'country', operator: 'EQUALS', value: 'DE' }],
    })
  })

  it('hides rules from non-members (404)', async () => {
    const { controller, req, prisma } = setup(null)
    await expect(controller.findAll(FLAG, req)).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(prisma.targetingRule.findMany).not.toHaveBeenCalled()
  })

  it.each([
    [
      'create',
      (c: TargetingRulesController, r: any) => c.create(FLAG, createDto(), r),
    ],
    [
      'update',
      (c: TargetingRulesController, r: any) =>
        c.update(FLAG, RULE, { enabled: false }, r),
    ],
    [
      'delete',
      (c: TargetingRulesController, r: any) => c.delete(FLAG, RULE, r),
    ],
  ])('forbids VIEWERs to %s rules', async (_, call) => {
    const { controller, req, prisma } = setup('VIEWER')
    await expect(call(controller, req)).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expect(prisma.targetingRule.create).not.toHaveBeenCalled()
    expect(prisma.targetingRule.update).not.toHaveBeenCalled()
    expect(prisma.targetingRule.delete).not.toHaveBeenCalled()
  })

  it('rejects environments of another project', async () => {
    const { controller, req, prisma } = setup('MEMBER', {
      envProject: OTHER_PROJECT,
    })
    await expect(
      controller.create(FLAG, createDto(), req)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.targetingRule.create).not.toHaveBeenCalled()
  })

  it('does not touch rules that belong to another flag', async () => {
    const { controller, req, prisma } = setup('MEMBER', { ruleOfFlag: false })
    await expect(
      controller.update(FLAG, RULE, { enabled: false }, req)
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(controller.delete(FLAG, RULE, req)).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(prisma.targetingRule.update).not.toHaveBeenCalled()
    expect(prisma.targetingRule.delete).not.toHaveBeenCalled()
  })
})

describe('TargetingRulesService behaviour', () => {
  it('creates a rule after the last one and writes an audit log', async () => {
    const { controller, req, prisma, auditLogs } = setup('MEMBER')
    const { rule } = await controller.create(FLAG, createDto(), req)

    expect(rule.priority).toBe(5)
    expect(prisma.targetingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          flagEnvId: FLAG_ENV,
          operator: 'AND',
          enabled: true,
          conditions: {
            create: [{ attribute: 'country', operator: 'EQUALS', value: 'DE' }],
          },
        }),
      })
    )
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'targeting_rule.created',
        organizationId: ORG,
        newValues: expect.objectContaining({
          flagId: FLAG,
          flagKey: 'my-flag',
        }),
      })
    )
  })

  it('writes no oldValues for a created rule', async () => {
    const { controller, req, auditLogs } = setup('MEMBER')
    await controller.create(FLAG, createDto(), req)
    expect(auditLogs.create.mock.calls[0][0].oldValues).toBeUndefined()
  })

  it('a failing audit write does not fail the rule change', async () => {
    const { controller, req, auditLogs } = setup('MEMBER')
    auditLogs.create.mockRejectedValue(new Error('audit down'))
    await expect(controller.create(FLAG, createDto(), req)).resolves.toEqual(
      expect.objectContaining({ rule: expect.anything() })
    )
    await expect(controller.delete(FLAG, RULE, req)).resolves.not.toThrow()
  })

  it('names the flag in update and delete audit entries', async () => {
    const { controller, req, auditLogs } = setup('MEMBER')
    await controller.update(FLAG, RULE, { enabled: false }, req)
    await controller.delete(FLAG, RULE, req)

    const [updated, deleted] = auditLogs.create.mock.calls.map(
      (call: any[]) => call[0]
    )
    expect(updated.action).toBe('targeting_rule.updated')
    expect(updated.newValues).toEqual({
      flagId: FLAG,
      flagKey: 'my-flag',
      enabled: false,
    })
    expect(updated.oldValues).toEqual(
      expect.objectContaining({ flagId: FLAG, flagKey: 'my-flag' })
    )
    expect(deleted.action).toBe('targeting_rule.deleted')
    expect(deleted.oldValues).toEqual(
      expect.objectContaining({ flagId: FLAG, flagKey: 'my-flag' })
    )
  })

  it.each([
    ['BOOLEAN', 'yes'],
    ['NUMBER', 'abc'],
    ['JSON', '{broken'],
  ])('rejects invalid serve values for %s flags', async (flagType, value) => {
    const { controller, req } = setup('MEMBER', { flagType })
    await expect(
      controller.create(FLAG, createDto({ serveValue: value }), req)
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects unsafe regular expressions', async () => {
    const { controller, req } = setup('MEMBER')
    await expect(
      controller.create(
        FLAG,
        createDto({
          conditions: [
            { attribute: 'email', operator: 'MATCHES_REGEX', value: '(a+)+$' },
          ],
        }),
        req
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects non-numeric values for numeric comparisons', async () => {
    const { controller, req } = setup('MEMBER')
    await expect(
      controller.create(
        FLAG,
        createDto({
          conditions: [
            { attribute: 'age', operator: 'GREATER_THAN', value: 'old' },
          ],
        }),
        req
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('replaces the condition list on update', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.update(
      FLAG,
      RULE,
      {
        conditions: [{ attribute: 'plan', operator: 'IN', value: 'pro,team' }],
      },
      req
    )
    expect(prisma.ruleCondition.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: RULE },
    })
    expect(prisma.ruleCondition.createMany).toHaveBeenCalledWith({
      data: [
        { ruleId: RULE, attribute: 'plan', operator: 'IN', value: 'pro,team' },
      ],
    })
  })
})

describe('TargetingRulesService change events', () => {
  const expected = {
    organizationId: ORG,
    projectId: PROJECT,
    environmentIds: [ENV],
    changes: [{ flagKey: 'my-flag', action: 'rules_changed' }],
  }

  it('create records rules_changed for the rule environment', async () => {
    const { controller, req, changes } = setup('MEMBER')
    await controller.create(FLAG, createDto(), req)
    expect(changes.recordChange).toHaveBeenCalledWith(expected)
  })

  it('create records nothing when the write fails', async () => {
    const { controller, req, prisma, changes } = setup('MEMBER')
    prisma.targetingRule.create.mockRejectedValue(new Error('db down'))
    await expect(controller.create(FLAG, createDto(), req)).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('update records rules_changed for the rule environment', async () => {
    const { controller, req, changes } = setup('MEMBER')
    await controller.update(FLAG, RULE, { enabled: false }, req)
    expect(changes.recordChange).toHaveBeenCalledWith(expected)
  })

  it('update records nothing when the write fails', async () => {
    const { controller, req, prisma, changes } = setup('MEMBER')
    prisma.targetingRule.update.mockRejectedValue(new Error('db down'))
    await expect(
      controller.update(FLAG, RULE, { enabled: false }, req)
    ).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('delete records rules_changed for the rule environment', async () => {
    const { controller, req, changes } = setup('MEMBER')
    await controller.delete(FLAG, RULE, req)
    expect(changes.recordChange).toHaveBeenCalledWith(expected)
  })

  it('delete records nothing for a rule of another flag', async () => {
    const { controller, req, changes } = setup('MEMBER', { ruleOfFlag: false })
    await expect(controller.delete(FLAG, RULE, req)).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('delete records nothing when the write fails', async () => {
    const { controller, req, prisma, changes } = setup('MEMBER')
    prisma.targetingRule.delete.mockRejectedValue(new Error('db down'))
    await expect(controller.delete(FLAG, RULE, req)).rejects.toThrow()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })
})

describe('Brand targeting rules', () => {
  it('returns the own rules of a brand', async () => {
    const { controller, req } = setup('VIEWER', {
      brandRow: true,
      brandRules: true,
    })
    const result = await controller.findAll(FLAG, req, ENV, BRAND)
    expect(result.inherited).toBe(false)
    expect(result.rules).toEqual([
      expect.objectContaining({ id: BRAND_RULE, brandId: BRAND }),
    ])
  })

  it('returns the environment rules as inherited without own rules', async () => {
    const { controller, req } = setup('VIEWER', { brandRow: true })
    const result = await controller.findAll(FLAG, req, ENV, BRAND)
    expect(result.inherited).toBe(true)
    expect(result.rules).toEqual([
      expect.objectContaining({ id: RULE, brandId: null }),
    ])
  })

  it('reports environment rules as not inherited', async () => {
    const { controller, req } = setup('VIEWER')
    const result = await controller.findAll(FLAG, req, ENV)
    expect(result.inherited).toBe(false)
  })

  it('requires an environment when a brand is given', async () => {
    const { controller, req } = setup('VIEWER')
    await expect(
      controller.findAll(FLAG, req, undefined, BRAND)
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('hides brands of another project (404)', async () => {
    const { controller, req, prisma } = setup('MEMBER', {
      brandProject: OTHER_PROJECT,
    })
    await expect(
      controller.findAll(FLAG, req, ENV, BRAND)
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      controller.create(FLAG, createDto({ brandId: BRAND }), req)
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      controller.resetBrandRules(FLAG, req, ENV, BRAND)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.targetingRule.create).not.toHaveBeenCalled()
    expect(prisma.targetingRule.deleteMany).not.toHaveBeenCalled()
  })

  it('creates the brand override with the environment values on the first rule', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.create(FLAG, createDto({ brandId: BRAND }), req)
    expect(prisma.flagEnvironment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          flagId: FLAG,
          environmentId: ENV,
          brandId: BRAND,
          enabled: true,
          defaultValue: 'true',
        },
      })
    )
    expect(prisma.targetingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ flagEnvId: BRAND_FLAG_ENV }),
      })
    )
  })

  it('adds rules to an existing brand override', async () => {
    const { controller, req, prisma } = setup('MEMBER', { brandRow: true })
    await controller.create(FLAG, createDto({ brandId: BRAND }), req)
    expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
    expect(prisma.targetingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ flagEnvId: BRAND_FLAG_ENV }),
      })
    )
  })

  it('reset deletes only the rules of the brand override', async () => {
    const { controller, req, prisma, auditLogs, changes } = setup('MEMBER', {
      brandRow: true,
      brandRules: true,
    })
    await expect(
      controller.resetBrandRules(FLAG, req, ENV, BRAND)
    ).resolves.toEqual({ deleted: 1 })
    expect(prisma.ruleCondition.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: { in: [BRAND_RULE] } },
    })
    expect(prisma.targetingRule.deleteMany).toHaveBeenCalledWith({
      where: { flagEnvId: BRAND_FLAG_ENV },
    })
    expect(changes.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({ environmentIds: [ENV] })
    )
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'targeting_rule.brand_reset',
        newValues: expect.objectContaining({
          environmentId: ENV,
          brandId: BRAND,
          deletedRules: 1,
        }),
      })
    )
  })

  it('reset without own rules changes nothing', async () => {
    const { controller, req, prisma, changes } = setup('MEMBER', {
      brandRow: true,
    })
    await expect(
      controller.resetBrandRules(FLAG, req, ENV, BRAND)
    ).resolves.toEqual({ deleted: 0 })
    expect(prisma.targetingRule.deleteMany).not.toHaveBeenCalled()
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('forbids VIEWERs to reset brand rules', async () => {
    const { controller, req, prisma } = setup('VIEWER', {
      brandRow: true,
      brandRules: true,
    })
    await expect(
      controller.resetBrandRules(FLAG, req, ENV, BRAND)
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.targetingRule.deleteMany).not.toHaveBeenCalled()
  })
})

describe('Targeting rule time windows', () => {
  const FROM = '2099-11-27T00:00:00.000Z'
  const UNTIL = '2099-11-30T00:00:00.000Z'

  it('stores the window and the next bound on create', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.create(
      FLAG,
      createDto({ activeFrom: FROM, activeUntil: UNTIL }),
      req
    )
    expect(prisma.targetingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activeFrom: new Date(FROM),
          activeUntil: new Date(UNTIL),
          nextBoundaryAt: new Date(FROM),
        }),
      })
    )
  })

  it('has no next bound for a rule without window or with a past window', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.create(FLAG, createDto(), req)
    await controller.create(
      FLAG,
      createDto({ activeUntil: '2000-01-01T00:00:00.000Z' }),
      req
    )
    for (const [call] of prisma.targetingRule.create.mock.calls) {
      expect(call.data.nextBoundaryAt).toBeNull()
    }
  })

  it('rejects a window that ends before it starts', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await expect(
      controller.create(
        FLAG,
        createDto({ activeFrom: UNTIL, activeUntil: FROM }),
        req
      )
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.targetingRule.create).not.toHaveBeenCalled()
  })

  it('checks a partial update against the stored window', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    prisma.targetingRule.findFirst.mockResolvedValue(
      storedRule({ activeFrom: new Date(UNTIL), activeUntil: null })
    )
    await expect(
      controller.update(FLAG, RULE, { activeUntil: FROM }, req)
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.targetingRule.update).not.toHaveBeenCalled()
  })

  it('clears a bound with null and recomputes the next bound', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    prisma.targetingRule.findFirst.mockResolvedValue(
      storedRule({ activeFrom: new Date(FROM), activeUntil: new Date(UNTIL) })
    )
    await controller.update(FLAG, RULE, { activeFrom: null }, req)
    expect(prisma.targetingRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activeFrom: null,
          nextBoundaryAt: new Date(UNTIL),
        }),
      })
    )
  })

  it('leaves the window alone when an update does not touch it', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.update(FLAG, RULE, { enabled: false }, req)
    const { data } = prisma.targetingRule.update.mock.calls[0][0]
    expect(data.activeFrom).toBeUndefined()
    expect(data.activeUntil).toBeUndefined()
    expect(data.nextBoundaryAt).toBeUndefined()
  })

  it('returns the window as ISO strings', async () => {
    const { controller, req, prisma } = setup('VIEWER')
    prisma.targetingRule.findMany.mockResolvedValue([
      storedRule({ activeFrom: new Date(FROM), activeUntil: null }),
    ])
    const { rules } = await controller.findAll(FLAG, req, ENV)
    expect(rules[0]).toMatchObject({ activeFrom: FROM, activeUntil: null })
  })
})

describe('Targeting rule DTO validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true })
  const validate = (metatype: any, value: unknown) =>
    pipe.transform(value, { type: 'body', metatype })

  it('accepts a valid rule', async () => {
    await expect(
      validate(CreateTargetingRuleDto, createDto())
    ).resolves.toBeDefined()
  })

  it.each([
    ['no conditions', { conditions: [] }],
    [
      'bad attribute name',
      {
        conditions: [
          { attribute: '__proto__ x', operator: 'EQUALS', value: 'x' },
        ],
      },
    ],
    [
      'unknown operator',
      { conditions: [{ attribute: 'a', operator: 'EVAL', value: 'x' }] },
    ],
    ['operator object injection', { environmentId: { not: 'x' } }],
    [
      'too many conditions',
      {
        conditions: Array.from({ length: 21 }, () => ({
          attribute: 'a',
          operator: 'EQUALS',
          value: 'x',
        })),
      },
    ],
  ])('rejects %s', async (_, overrides) => {
    await expect(
      validate(CreateTargetingRuleDto, { ...createDto(), ...overrides })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects an empty condition list on update', async () => {
    await expect(
      validate(UpdateTargetingRuleDto, { conditions: [] })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepts ISO time window bounds, and null on update', async () => {
    await expect(
      validate(CreateTargetingRuleDto, {
        ...createDto(),
        activeFrom: '2099-11-27T00:00:00.000Z',
        activeUntil: '2099-11-30T00:00:00Z',
      })
    ).resolves.toBeDefined()
    await expect(
      validate(UpdateTargetingRuleDto, { activeFrom: null, activeUntil: null })
    ).resolves.toEqual({ activeFrom: null, activeUntil: null })
  })

  it.each([['not a date'], [42], [{ $gt: '' }]])(
    'rejects %p as time window bound',
    async (value) => {
      await expect(
        validate(CreateTargetingRuleDto, { ...createDto(), activeFrom: value })
      ).rejects.toBeInstanceOf(BadRequestException)
    }
  )
})
