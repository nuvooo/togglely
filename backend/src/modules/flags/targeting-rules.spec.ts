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
  } = {}
) {
  const envProject = opts.envProject ?? PROJECT
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
            : { id: FLAG, projectId: PROJECT, organizationId: ORG }
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
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.projectId === envProject ? { id: where.id } : null)
      ),
    },
    flagEnvironment: {
      findFirst: jest.fn().mockResolvedValue({ id: FLAG_ENV }),
      create: jest.fn().mockResolvedValue({ id: FLAG_ENV }),
    },
    targetingRule: {
      findMany: jest.fn().mockResolvedValue([storedRule()]),
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
    },
    ruleCondition: {
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg)
    ),
  }
  const auditLogs = { create: jest.fn().mockResolvedValue({}) } as any
  const service = new TargetingRulesService(prisma, auditLogs)
  const controller = new TargetingRulesController(
    service,
    new AccessService(prisma)
  )
  return { controller, prisma, auditLogs, req: { user: { userId: USER } } }
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
    ['create', (c: TargetingRulesController, r: any) => c.create(FLAG, createDto(), r)],
    ['update', (c: TargetingRulesController, r: any) => c.update(FLAG, RULE, { enabled: false }, r)],
    ['delete', (c: TargetingRulesController, r: any) => c.delete(FLAG, RULE, r)],
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
      })
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
      data: [{ ruleId: RULE, attribute: 'plan', operator: 'IN', value: 'pro,team' }],
    })
  })
})

describe('Targeting rule DTO validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true })
  const validate = (metatype: any, value: unknown) =>
    pipe.transform(value, { type: 'body', metatype })

  it('accepts a valid rule', async () => {
    await expect(validate(CreateTargetingRuleDto, createDto())).resolves.toBeDefined()
  })

  it.each([
    ['no conditions', { conditions: [] }],
    ['bad attribute name', { conditions: [{ attribute: '__proto__ x', operator: 'EQUALS', value: 'x' }] }],
    ['unknown operator', { conditions: [{ attribute: 'a', operator: 'EVAL', value: 'x' }] }],
    ['operator object injection', { environmentId: { not: 'x' } }],
    ['too many conditions', { conditions: Array.from({ length: 21 }, () => ({ attribute: 'a', operator: 'EQUALS', value: 'x' })) }],
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
})
