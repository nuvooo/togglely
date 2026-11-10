import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { FLAG_KEY_MAX_LENGTH, FLAG_VALUE_MAX_LENGTH } from '../flags/dto/limits'
import { McpContext } from './mcp-key.resolver'
import { McpToolError, McpToolsService } from './mcp-tools.service'

const ctx: McpContext = {
  apiKeyId: 'k1',
  apiKeyName: 'key',
  userId: 'u1',
  organizationId: 'o1',
  projectId: 'p1',
  allowedEnvironmentIds: ['e1'],
  role: 'MEMBER',
}

describe('McpToolsService', () => {
  let prisma: any
  let flags: any
  let service: McpToolsService

  const flag = (over: any = {}) => ({
    id: 'f1',
    key: 'my-flag',
    name: 'My',
    description: null,
    flagType: 'BOOLEAN',
    projectId: 'p1',
    flagEnvironments: [],
    ...over,
  })

  beforeEach(() => {
    prisma = {
      project: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ key: 'proj', name: 'Proj', type: 'SINGLE' }),
      },
      environment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', key: 'dev', name: 'Dev' },
          { id: 'e2', key: 'prod', name: 'Prod' },
        ]),
      },
      brand: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'b1', key: 'acme', name: 'Acme' }]),
      },
      featureFlag: {
        findFirst: jest.fn().mockResolvedValue(flag()),
        findMany: jest.fn().mockResolvedValue([]),
      },
      targetingRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      experiment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
    flags = {
      create: jest.fn().mockResolvedValue({ key: 'new' }),
      update: jest.fn().mockResolvedValue({ key: 'my-flag' }),
      updateValue: jest
        .fn()
        .mockResolvedValue({ enabled: true, defaultValue: 'true' }),
      delete: jest.fn().mockResolvedValue(undefined),
    }
    service = new McpToolsService(prisma, flags)
  })

  it('getProject marks canToggle from allowedEnvironmentIds', async () => {
    const res = await service.getProject(ctx)
    expect(res.environments).toEqual([
      { key: 'dev', name: 'Dev', canToggle: true },
      { key: 'prod', name: 'Prod', canToggle: false },
    ])
    expect(res.brands).toEqual([{ key: 'acme', name: 'Acme' }])
    expect(res.project).toEqual({ key: 'proj', name: 'Proj', type: 'SINGLE' })
  })

  it('getFlag does not find a flag key that only exists in another project', async () => {
    prisma.featureFlag.findFirst.mockResolvedValue(null)
    await expect(service.getFlag(ctx, { flagKey: 'other' })).rejects.toThrow(
      new McpToolError('Flag "other" not found in this project')
    )
    expect(prisma.featureFlag.findFirst.mock.calls[0][0].where).toMatchObject({
      projectId: 'p1',
      key: 'other',
    })
  })

  it('createFlag rejects key longer than FLAG_KEY_MAX_LENGTH without calling FlagsService', async () => {
    await expect(
      service.createFlag(ctx, {
        key: 'a'.repeat(FLAG_KEY_MAX_LENGTH + 1),
        name: 'n',
        type: 'BOOLEAN',
      })
    ).rejects.toBeInstanceOf(McpToolError)
    expect(flags.create).not.toHaveBeenCalled()
  })

  it('createFlag maps ConflictException to McpToolError', async () => {
    flags.create.mockRejectedValue(
      new ConflictException('Flag key already exists')
    )
    await expect(
      service.createFlag(ctx, { key: 'dup', name: 'n', type: 'BOOLEAN' })
    ).rejects.toThrow(new McpToolError('Flag key already exists'))
  })

  it('createFlag with initialValues is rejected / does not reach FlagsService', async () => {
    await expect(
      service.createFlag(ctx, {
        key: 'k',
        name: 'n',
        type: 'BOOLEAN',
        initialValues: { prod: { enabled: true, value: 'true' } },
      } as never)
    ).rejects.toBeInstanceOf(McpToolError)
    expect(flags.create).not.toHaveBeenCalled()
  })

  it('createFlag passes exactly key, name, description, type to FlagsService', async () => {
    await service.createFlag(ctx, {
      key: 'k',
      name: 'n',
      description: 'd',
      type: 'BOOLEAN',
    })
    const dto = flags.create.mock.calls[0][2]
    expect(flags.create.mock.calls[0][0]).toBe('p1')
    expect({ ...dto }).toEqual({
      key: 'k',
      name: 'n',
      description: 'd',
      type: 'BOOLEAN',
      initialValues: {
        dev: { enabled: false, value: 'false' },
        prod: { enabled: false, value: 'false' },
      },
    })
  })

  it('createFlag NUMBER passes type default value 0 disabled for every environment', async () => {
    await service.createFlag(ctx, { key: 'limit', name: 'n', type: 'NUMBER' })
    expect(flags.create.mock.calls[0][2].initialValues).toEqual({
      dev: { enabled: false, value: '0' },
      prod: { enabled: false, value: '0' },
    })
  })

  it('createFlag maps a Prisma unique-constraint error to a friendly McpToolError', async () => {
    flags.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5',
      })
    )
    await expect(
      service.createFlag(ctx, { key: 'dup', name: 'n', type: 'BOOLEAN' })
    ).rejects.toThrow(
      new McpToolError('Flag key already exists in this project')
    )
  })

  it('createFlag rethrows unexpected errors unchanged (not as McpToolError)', async () => {
    const boom = new Error('connection refused at 10.0.0.1')
    flags.create.mockRejectedValue(boom)
    const err = await service
      .createFlag(ctx, { key: 'k', name: 'n', type: 'BOOLEAN' })
      .catch((e) => e)
    expect(err).toBe(boom)
    expect(err).not.toBeInstanceOf(McpToolError)
  })

  it('getFlag normalises the key (trim + lowercase)', async () => {
    await service.getFlag(ctx, { flagKey: ' New-Checkout ' })
    expect(prisma.featureFlag.findFirst.mock.calls[0][0].where).toMatchObject({
      projectId: 'p1',
      key: 'new-checkout',
    })
  })

  it('setFlagState normalises the flag key', async () => {
    await service.setFlagState(ctx, {
      flagKey: 'New-Checkout',
      environmentKey: 'dev',
      enabled: true,
    })
    expect(prisma.featureFlag.findFirst.mock.calls[0][0].where).toMatchObject({
      key: 'new-checkout',
    })
  })

  it('setFlagState with an empty allowlist reports Allowed: (none)', async () => {
    await expect(
      service.setFlagState(
        { ...ctx, allowedEnvironmentIds: [] },
        { flagKey: 'my-flag', environmentKey: 'dev', enabled: true }
      )
    ).rejects.toThrow(/may not change environment "dev"\. Allowed: \(none\)$/)
    expect(flags.updateValue).not.toHaveBeenCalled()
  })

  it('VIEWER cannot createFlag', async () => {
    await expect(
      service.createFlag(
        { ...ctx, role: 'VIEWER' },
        { key: 'k', name: 'n', type: 'BOOLEAN' }
      )
    ).rejects.toThrow(new McpToolError('Your role does not allow this action'))
    expect(flags.create).not.toHaveBeenCalled()
  })

  it('setFlagState in non-allowed environment throws and does not call updateValue', async () => {
    await expect(
      service.setFlagState(ctx, {
        flagKey: 'my-flag',
        environmentKey: 'prod',
        enabled: true,
      })
    ).rejects.toThrow(/may not change environment "prod"\. Allowed: dev/)
    expect(flags.updateValue).not.toHaveBeenCalled()
  })

  it('setFlagState in allowed environment calls updateValue(flagId, envId, { enabled: true }, userId)', async () => {
    const res = await service.setFlagState(ctx, {
      flagKey: 'my-flag',
      environmentKey: 'dev',
      enabled: true,
    })
    expect(flags.updateValue).toHaveBeenCalledWith(
      'f1',
      'e1',
      { enabled: true },
      'u1'
    )
    expect(res).toEqual({ environmentKey: 'dev', enabled: true, value: 'true' })
  })

  it('setFlagState rejects value longer than FLAG_VALUE_MAX_LENGTH', async () => {
    await expect(
      service.setFlagState(ctx, {
        flagKey: 'my-flag',
        environmentKey: 'dev',
        value: 'x'.repeat(FLAG_VALUE_MAX_LENGTH + 1),
      })
    ).rejects.toBeInstanceOf(McpToolError)
    expect(flags.updateValue).not.toHaveBeenCalled()
  })

  it('setFlagState requires enabled or value', async () => {
    await expect(
      service.setFlagState(ctx, { flagKey: 'my-flag', environmentKey: 'dev' })
    ).rejects.toBeInstanceOf(McpToolError)
  })

  describe('deleteFlag', () => {
    const uniform = flag({
      flagEnvironments: [
        {
          id: 'fe1',
          environmentId: 'e1',
          brandId: null,
          enabled: false,
          defaultValue: 'false',
        },
        {
          id: 'fe2',
          environmentId: 'e2',
          brandId: null,
          enabled: false,
          defaultValue: 'false',
        },
      ],
    })

    it('without confirm reports states and does not delete', async () => {
      prisma.featureFlag.findFirst.mockResolvedValue(uniform)
      const res = await service.deleteFlag(ctx, {
        flagKey: 'my-flag',
        confirm: false,
      })
      expect(res.deleted).toBe(false)
      expect(res.canDelete).toBe(true)
      expect(res.states).toHaveLength(2)
      expect(flags.delete).not.toHaveBeenCalled()
    })

    it('with confirm and divergent brand override throws and does not delete', async () => {
      prisma.featureFlag.findFirst.mockResolvedValue(
        flag({
          flagEnvironments: [
            {
              environmentId: 'e1',
              brandId: null,
              enabled: true,
              defaultValue: 'true',
            },
            {
              environmentId: 'e2',
              brandId: null,
              enabled: true,
              defaultValue: 'true',
            },
            {
              environmentId: 'e2',
              brandId: 'b1',
              enabled: false,
              defaultValue: 'false',
            },
          ],
        })
      )
      await expect(
        service.deleteFlag(ctx, { flagKey: 'my-flag', confirm: true })
      ).rejects.toThrow(/prod.*acme/)
      expect(flags.delete).not.toHaveBeenCalled()
    })

    it('with confirm and uniform states deletes as MEMBER', async () => {
      prisma.featureFlag.findFirst.mockResolvedValue(uniform)
      const res = await service.deleteFlag(ctx, {
        flagKey: 'my-flag',
        confirm: true,
      })
      expect(flags.delete).toHaveBeenCalledWith('f1', 'u1')
      expect(res.deleted).toBe(true)
    })

    it('with confirm, uniform states and an enabled targeting rule refuses and does not delete', async () => {
      prisma.featureFlag.findFirst.mockResolvedValue(uniform)
      prisma.targetingRule.findMany.mockResolvedValue([
        {
          environmentIds: ['e2'],
          environmentsExcluded: false,
          brandIds: [],
          brandsExcluded: false,
        },
      ])
      await expect(
        service.deleteFlag(ctx, { flagKey: 'my-flag', confirm: true })
      ).rejects.toThrow(/targeting rule.*prod/i)
      expect(prisma.targetingRule.findMany.mock.calls[0][0].where).toEqual({
        flagId: 'f1',
        enabled: true,
      })
      expect(flags.delete).not.toHaveBeenCalled()
    })

    it('with confirm, uniform states and a running experiment refuses and does not delete', async () => {
      prisma.featureFlag.findFirst.mockResolvedValue(uniform)
      prisma.experiment.findMany.mockResolvedValue([
        { key: 'checkout-test', status: 'RUNNING' },
      ])
      await expect(
        service.deleteFlag(ctx, { flagKey: 'my-flag', confirm: true })
      ).rejects.toThrow(/checkout-test.*RUNNING/)
      expect(prisma.experiment.findMany.mock.calls[0][0].where).toEqual({
        flagId: 'f1',
        status: { notIn: ['COMPLETED', 'ARCHIVED'] },
      })
      expect(flags.delete).not.toHaveBeenCalled()
    })

    it('without confirm lists blockers and canDelete false', async () => {
      prisma.featureFlag.findFirst.mockResolvedValue(uniform)
      prisma.targetingRule.findMany.mockResolvedValue([
        {
          environmentIds: ['e1'],
          environmentsExcluded: false,
          brandIds: [],
          brandsExcluded: false,
        },
      ])
      prisma.experiment.findMany.mockResolvedValue([
        { key: 'exp', status: 'PAUSED' },
      ])
      const res = await service.deleteFlag(ctx, {
        flagKey: 'my-flag',
        confirm: false,
      })
      expect(res.canDelete).toBe(false)
      expect(res.blockers).toHaveLength(2)
      expect(res.blockers.join(' ')).toMatch(/dev/)
      expect(res.blockers.join(' ')).toMatch(/exp.*PAUSED/)
      expect(flags.delete).not.toHaveBeenCalled()
    })

    it('with confirm, uniform states and no blockers deletes and reports no blockers', async () => {
      prisma.featureFlag.findFirst.mockResolvedValue(uniform)
      const res = await service.deleteFlag(ctx, {
        flagKey: 'my-flag',
        confirm: true,
      })
      expect(flags.delete).toHaveBeenCalledWith('f1', 'u1')
      expect(res.blockers).toEqual([])
    })
  })
})
