import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { FlagsController } from './flags.controller'

const USER = '64a000000000000000000001'
const ORG = '64a000000000000000000010'
const PROJECT = '64a000000000000000000020'
const OTHER_PROJECT = '64a000000000000000000021'
const FLAG = '64a000000000000000000030'
const ENV = '64a000000000000000000040'
const BRAND = '64a000000000000000000050'

type Role = 'VIEWER' | 'MEMBER' | 'ADMIN' | 'OWNER' | null

/**
 * Uses the real AccessService against a mocked Prisma client so the tests
 * prove the controller actually enforces tenant isolation and roles.
 */
function setup(
  role: Role,
  opts: { envProject?: string; brandProject?: string } = {}
) {
  const envProject = opts.envProject ?? PROJECT
  const brandProject = opts.brandProject ?? PROJECT
  const prisma = {
    project: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: PROJECT, organizationId: ORG }),
    },
    featureFlag: {
      findUnique: jest.fn().mockResolvedValue({
        id: FLAG,
        projectId: PROJECT,
        organizationId: ORG,
      }),
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
  } as any

  const flagsService = {
    findAll: jest.fn().mockResolvedValue([]),
    findByProject: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: FLAG }),
    create: jest.fn().mockResolvedValue({ featureFlag: { id: FLAG } }),
    update: jest.fn().mockResolvedValue({ id: FLAG }),
    toggle: jest.fn().mockResolvedValue({ flagId: FLAG }),
    getEnvironments: jest.fn().mockResolvedValue([]),
    updateEnvironment: jest.fn().mockResolvedValue({}),
    updateValue: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue(undefined),
  } as any

  const controller = new FlagsController(
    flagsService,
    new AccessService(prisma)
  )
  const req = { user: { userId: USER } }
  return { controller, flagsService, prisma, req }
}

const createDto = { name: 'Flag', key: 'flag', type: 'BOOLEAN' as const }

type Call = [string, (c: FlagsController, req: any) => Promise<unknown>]

function expectServiceUntouched(flagsService: Record<string, jest.Mock>) {
  for (const fn of Object.values(flagsService)) {
    expect(fn).not.toHaveBeenCalled()
  }
}

describe('FlagsController access control', () => {
  describe('non-members get 404 on every route', () => {
    const calls: Call[] = [
      ['findAll(projectId)', (c, req) => c.findAll(req, PROJECT)],
      ['findByProject', (c, req) => c.findByProject(PROJECT, req)],
      ['findOne', (c, req) => c.findOne(FLAG, req)],
      ['create', (c, req) => c.create(PROJECT, createDto, req)],
      ['update', (c, req) => c.update(FLAG, { name: 'x' }, req)],
      ['toggle', (c, req) => c.toggle(FLAG, { environmentId: ENV }, req)],
      ['getEnvironments', (c, req) => c.getEnvironments(FLAG, req)],
      [
        'updateEnvironment',
        (c, req) => c.updateEnvironment(FLAG, ENV, {}, req),
      ],
      ['updateValue', (c, req) => c.updateValue(FLAG, ENV, {}, req)],
      ['delete', (c, req) => c.delete(FLAG, req)],
    ]

    it.each(calls)('%s', async (_name, call) => {
      const { controller, flagsService, req } = setup(null)
      await expect(call(controller, req)).rejects.toBeInstanceOf(
        NotFoundException
      )
      expectServiceUntouched(flagsService)
    })
  })

  describe('VIEWERs cannot mutate', () => {
    const calls: Call[] = [
      ['create', (c, req) => c.create(PROJECT, createDto, req)],
      ['update', (c, req) => c.update(FLAG, { name: 'x' }, req)],
      ['toggle', (c, req) => c.toggle(FLAG, { environmentId: ENV }, req)],
      [
        'updateEnvironment',
        (c, req) => c.updateEnvironment(FLAG, ENV, {}, req),
      ],
      ['updateValue', (c, req) => c.updateValue(FLAG, ENV, {}, req)],
      ['delete', (c, req) => c.delete(FLAG, req)],
    ]

    it.each(calls)('%s', async (_name, call) => {
      const { controller, flagsService, req } = setup('VIEWER')
      await expect(call(controller, req)).rejects.toBeInstanceOf(
        ForbiddenException
      )
      expectServiceUntouched(flagsService)
    })
  })

  it('VIEWERs can read', async () => {
    const { controller, flagsService, req } = setup('VIEWER')
    await controller.findAll(req, PROJECT)
    await controller.findByProject(PROJECT, req)
    await controller.findOne(FLAG, req)
    await controller.getEnvironments(FLAG, req)
    expect(flagsService.findAll).toHaveBeenCalledWith(USER, PROJECT, undefined)
    expect(flagsService.findByProject).toHaveBeenCalledWith(PROJECT)
    expect(flagsService.findOne).toHaveBeenCalledWith(FLAG)
    expect(flagsService.getEnvironments).toHaveBeenCalledWith(FLAG)
  })

  it('MEMBERs can create/update/toggle but not delete', async () => {
    const { controller, flagsService, req } = setup('MEMBER')
    await controller.create(PROJECT, createDto, req)
    await controller.update(FLAG, { name: 'x' }, req)
    await controller.toggle(FLAG, { environmentId: ENV, enabled: true }, req)
    expect(flagsService.create).toHaveBeenCalledWith(PROJECT, USER, createDto)
    expect(flagsService.update).toHaveBeenCalledWith(FLAG, { name: 'x' })
    expect(flagsService.toggle).toHaveBeenCalledWith(FLAG, ENV, true, USER)

    await expect(controller.delete(FLAG, req)).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expect(flagsService.delete).not.toHaveBeenCalled()
  })

  it('ADMINs can delete', async () => {
    const { controller, flagsService, req } = setup('ADMIN')
    await expect(controller.delete(FLAG, req)).resolves.toEqual({
      success: true,
    })
    expect(flagsService.delete).toHaveBeenCalledWith(FLAG, USER)
  })

  it('findAll without projectId lets the service scope by membership', async () => {
    const { controller, flagsService, prisma, req } = setup(null)
    await controller.findAll(req, undefined, ENV)
    expect(prisma.project.findUnique).not.toHaveBeenCalled()
    // environmentId is ignored without a project
    expect(flagsService.findAll).toHaveBeenCalledWith(
      USER,
      undefined,
      undefined
    )
  })

  it('findAll rejects a malformed projectId', async () => {
    const { controller, flagsService, req } = setup('VIEWER')
    await expect(controller.findAll(req, 'nope')).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(flagsService.findAll).not.toHaveBeenCalled()
  })

  it('findAll rejects an environment of another project', async () => {
    const { controller, flagsService, req } = setup('VIEWER', {
      envProject: OTHER_PROJECT,
    })
    await expect(controller.findAll(req, PROJECT, ENV)).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(flagsService.findAll).not.toHaveBeenCalled()
  })

  it('toggle rejects an environment outside the flag project', async () => {
    const { controller, flagsService, req } = setup('MEMBER', {
      envProject: OTHER_PROJECT,
    })
    await expect(
      controller.toggle(FLAG, { environmentId: ENV }, req)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(flagsService.toggle).not.toHaveBeenCalled()
  })

  it('updateValue rejects an environment outside the flag project', async () => {
    const { controller, flagsService, req } = setup('MEMBER', {
      envProject: OTHER_PROJECT,
    })
    await expect(
      controller.updateValue(FLAG, ENV, { value: 'x' }, req)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(flagsService.updateValue).not.toHaveBeenCalled()
  })

  it('updateValue rejects a brand outside the flag project', async () => {
    const { controller, flagsService, req } = setup('MEMBER', {
      brandProject: OTHER_PROJECT,
    })
    await expect(
      controller.updateValue(FLAG, ENV, { value: 'x', brandId: BRAND }, req)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(flagsService.updateValue).not.toHaveBeenCalled()
  })

  it('updateValue accepts a brand of the same project', async () => {
    const { controller, flagsService, req } = setup('MEMBER')
    await controller.updateValue(FLAG, ENV, { value: 'x', brandId: BRAND }, req)
    expect(flagsService.updateValue).toHaveBeenCalledWith(
      FLAG,
      ENV,
      { value: 'x', brandId: BRAND },
      USER
    )
  })

  it('updateEnvironment passes the acting user for the audit log', async () => {
    const { controller, flagsService, req } = setup('MEMBER')
    await controller.updateEnvironment(FLAG, ENV, { isEnabled: true }, req)
    expect(flagsService.updateEnvironment).toHaveBeenCalledWith(
      FLAG,
      ENV,
      { isEnabled: true },
      USER
    )
  })

  it('updateEnvironment rejects a malformed envId', async () => {
    const { controller, flagsService, req } = setup('MEMBER')
    await expect(
      controller.updateEnvironment(FLAG, 'not-an-id', {}, req)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(flagsService.updateEnvironment).not.toHaveBeenCalled()
  })
})
