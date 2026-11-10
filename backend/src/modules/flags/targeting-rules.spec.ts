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
const ENV_2 = '64a000000000000000000041'
const RULE = '64a000000000000000000060'
const BRAND = '64a000000000000000000070'

type Role = 'VIEWER' | 'MEMBER' | 'ADMIN' | 'OWNER' | null

function storedRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE,
    flagId: FLAG,
    environmentIds: [ENV],
    environmentsExcluded: false,
    brandIds: [],
    brandsExcluded: false,
    name: 'DE users',
    operator: 'AND',
    groupOperators: [],
    serveValue: 'true',
    priority: 0,
    isDefault: false,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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
  } = {}
) {
  const envProject = opts.envProject ?? PROJECT
  const brandProject = opts.brandProject ?? PROJECT
  // count of the requested ids that belong to the project
  const countIn =
    (project: string) =>
    ({ where }: any) =>
      Promise.resolve(where.projectId === project ? where.id.in.length : 0)
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
    environment: { count: jest.fn().mockImplementation(countIn(envProject)) },
    brand: { count: jest.fn().mockImplementation(countIn(brandProject)) },
    targetingRule: {
      findMany: jest.fn().mockResolvedValue([storedRule()]),
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id) {
          return Promise.resolve(
            opts.ruleOfFlag === false ? null : storedRule()
          )
        }
        return Promise.resolve({ priority: 4 })
      }),
      create: jest
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve(
            storedRule({ ...data, conditions: storedRule().conditions })
          )
        ),
      update: jest.fn().mockResolvedValue(storedRule({ enabled: false })),
      delete: jest.fn().mockResolvedValue({}),
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
    const result = await controller.findAll(FLAG, req)
    expect(result.rules[0]).toMatchObject({
      id: RULE,
      environmentIds: [ENV],
      brandIds: [],
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
          flagId: FLAG,
          operator: 'AND',
          enabled: true,
          conditions: {
            create: [
              {
                attribute: 'country',
                operator: 'EQUALS',
                value: 'DE',
                groupIndex: 0,
              },
            ],
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
        {
          ruleId: RULE,
          attribute: 'plan',
          operator: 'IN',
          value: 'pro,team',
          groupIndex: 0,
        },
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

describe('Targeting rule scope', () => {
  it('lists all rules of the flag', async () => {
    const { controller, req, prisma } = setup('VIEWER')
    await controller.findAll(FLAG, req)
    expect(prisma.targetingRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { flagId: FLAG } })
    )
  })

  it('stores the scope of a new rule', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.create(
      FLAG,
      createDto({
        environmentId: undefined,
        environmentIds: [ENV, ENV_2, ENV],
        brandIds: [BRAND],
        brandsExcluded: true,
      }),
      req
    )
    expect(prisma.targetingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          flagId: FLAG,
          environmentIds: [ENV, ENV_2],
          environmentsExcluded: false,
          brandIds: [BRAND],
          brandsExcluded: true,
        }),
      })
    )
  })

  it('applies a new rule everywhere without a scope', async () => {
    const { controller, req, prisma, changes } = setup('MEMBER')
    await controller.create(FLAG, createDto({ environmentId: undefined }), req)
    expect(prisma.targetingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ environmentIds: [], brandIds: [] }),
      })
    )
    expect(changes.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({ environmentIds: 'all' })
    )
  })

  it('accepts the legacy environmentId / brandId shorthand', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.create(FLAG, createDto({ brandId: BRAND }), req)
    expect(prisma.targetingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          environmentIds: [ENV],
          brandIds: [BRAND],
        }),
      })
    )
  })

  it.each([
    ['an environment', { envProject: OTHER_PROJECT }],
    ['a brand', { brandProject: OTHER_PROJECT }],
  ])('rejects %s of another project (404)', async (_, opts) => {
    const { controller, req, prisma } = setup('MEMBER', opts)
    await expect(
      controller.create(FLAG, createDto({ brandIds: [BRAND] }), req)
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      controller.update(
        FLAG,
        RULE,
        { brandIds: [BRAND], environmentIds: [ENV] },
        req
      )
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.targetingRule.create).not.toHaveBeenCalled()
    expect(prisma.targetingRule.update).not.toHaveBeenCalled()
  })

  it('changes the scope on update and announces old and new environments', async () => {
    const { controller, req, prisma, changes } = setup('MEMBER')
    prisma.targetingRule.update.mockResolvedValue(
      storedRule({ environmentIds: [ENV_2] })
    )
    await controller.update(FLAG, RULE, { environmentIds: [ENV_2] }, req)
    expect(prisma.targetingRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ environmentIds: [ENV_2] }),
      })
    )
    expect(changes.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({ environmentIds: [ENV, ENV_2] })
    )
  })

  it('leaves the scope alone when an update does not touch it', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.update(FLAG, RULE, { enabled: false }, req)
    const { data } = prisma.targetingRule.update.mock.calls[0][0]
    expect(data.environmentIds).toBeUndefined()
    expect(data.brandIds).toBeUndefined()
  })

  it('returns the scope of a rule', async () => {
    const { controller, req, prisma } = setup('VIEWER')
    prisma.targetingRule.findMany.mockResolvedValue([
      storedRule({ brandIds: [BRAND], brandsExcluded: true }),
    ])
    const { rules } = await controller.findAll(FLAG, req)
    expect(rules[0]).toMatchObject({
      environmentIds: [ENV],
      environmentsExcluded: false,
      brandIds: [BRAND],
      brandsExcluded: true,
    })
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
    const { rules } = await controller.findAll(FLAG, req)
    expect(rules[0]).toMatchObject({ activeFrom: FROM, activeUntil: null })
  })
})

describe('Targeting rule condition groups', () => {
  const de = { attribute: 'country', operator: 'EQUALS' as const, value: 'DE' }
  const pro = { attribute: 'plan', operator: 'EQUALS' as const, value: 'pro' }
  const beta = { attribute: 'beta', operator: 'EQUALS' as const, value: 'yes' }
  const groupsDto = {
    operator: 'AND' as const,
    conditions: undefined,
    groups: [
      { operator: 'AND' as const, conditions: [de] },
      { operator: 'OR' as const, conditions: [pro, beta] },
    ],
  }

  it('stores groups as groupIndex and groupOperators', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.create(FLAG, createDto(groupsDto), req)
    expect(prisma.targetingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operator: 'AND',
          groupOperators: ['AND', 'OR'],
          conditions: {
            create: [
              { ...de, groupIndex: 0 },
              { ...pro, groupIndex: 1 },
              { ...beta, groupIndex: 1 },
            ],
          },
        }),
      })
    )
  })

  it('stores flat conditions as one group', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.create(FLAG, createDto({ operator: 'OR' }), req)
    expect(prisma.targetingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operator: 'OR',
          groupOperators: ['OR'],
          conditions: { create: [{ ...de, groupIndex: 0 }] },
        }),
      })
    )
  })

  it.each([
    ['both conditions and groups', { ...groupsDto, conditions: [de] }],
    ['neither conditions nor groups', { conditions: undefined }],
    [
      'more than 20 conditions over all groups',
      {
        conditions: undefined,
        groups: [
          { operator: 'AND' as const, conditions: Array(11).fill(de) },
          { operator: 'AND' as const, conditions: Array(10).fill(pro) },
        ],
      },
    ],
  ])('rejects %s', async (_, overrides) => {
    const { controller, req, prisma } = setup('MEMBER')
    await expect(
      controller.create(FLAG, createDto(overrides), req)
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.targetingRule.create).not.toHaveBeenCalled()
  })

  it('replaces the conditions with groups on update', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    await controller.update(
      FLAG,
      RULE,
      { operator: 'OR', groups: groupsDto.groups },
      req
    )
    expect(prisma.ruleCondition.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: RULE },
    })
    expect(prisma.ruleCondition.createMany).toHaveBeenCalledWith({
      data: [
        { ruleId: RULE, ...de, groupIndex: 0 },
        { ruleId: RULE, ...pro, groupIndex: 1 },
        { ruleId: RULE, ...beta, groupIndex: 1 },
      ],
    })
    expect(prisma.targetingRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operator: 'OR',
          groupOperators: ['AND', 'OR'],
        }),
      })
    )
  })

  it('an operator-only update of a single-group rule changes its group operator', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    prisma.targetingRule.findFirst.mockResolvedValue(
      storedRule({ groupOperators: ['AND'] })
    )
    await controller.update(FLAG, RULE, { operator: 'OR' }, req)
    expect(prisma.targetingRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operator: 'OR',
          groupOperators: ['OR'],
        }),
      })
    )
  })

  it('an operator-only update of a grouped rule only changes how groups combine', async () => {
    const { controller, req, prisma } = setup('MEMBER')
    prisma.targetingRule.findFirst.mockResolvedValue(
      storedRule({ groupOperators: ['AND', 'OR'] })
    )
    await controller.update(FLAG, RULE, { operator: 'OR' }, req)
    const { data } = prisma.targetingRule.update.mock.calls[0][0]
    expect(data.operator).toBe('OR')
    expect(data.groupOperators).toBeUndefined()
  })

  it('returns the groups of a rule', async () => {
    const { controller, req, prisma } = setup('VIEWER')
    prisma.targetingRule.findMany.mockResolvedValue([
      storedRule({
        operator: 'AND',
        groupOperators: ['AND', 'OR'],
        conditions: [
          { id: 'c1', ...de, groupIndex: 0 },
          { id: 'c2', ...pro, groupIndex: 1 },
          { id: 'c3', ...beta, groupIndex: 1 },
        ],
      }),
    ])
    const { rules } = await controller.findAll(FLAG, req)
    expect(rules[0].groups).toEqual([
      { operator: 'AND', conditions: [{ id: 'c1', ...de }] },
      {
        operator: 'OR',
        conditions: [
          { id: 'c2', ...pro },
          { id: 'c3', ...beta },
        ],
      },
    ])
  })

  it('returns a rule saved before groups existed as one group', async () => {
    const { controller, req } = setup('VIEWER')
    const { rules } = await controller.findAll(FLAG, req)
    expect(rules[0].groups).toEqual([
      { operator: 'AND', conditions: [{ id: 'c1', ...de }] },
    ])
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

  it('accepts groups instead of conditions', async () => {
    const { conditions, ...rest } = createDto()
    await expect(
      validate(CreateTargetingRuleDto, {
        ...rest,
        groups: [{ operator: 'OR', conditions }],
      })
    ).resolves.toBeDefined()
  })

  it.each([
    ['an empty group', [{ operator: 'AND', conditions: [] }]],
    [
      'an unknown group operator',
      [{ operator: 'XOR', conditions: createDto().conditions }],
    ],
    [
      'more than 10 groups',
      Array.from({ length: 11 }, () => ({
        operator: 'AND',
        conditions: createDto().conditions,
      })),
    ],
    ['no groups', []],
  ])('rejects %s', async (_, groups) => {
    await expect(
      validate(UpdateTargetingRuleDto, { groups })
    ).rejects.toBeInstanceOf(BadRequestException)
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
