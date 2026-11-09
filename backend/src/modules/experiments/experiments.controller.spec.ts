import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { ExperimentsController } from './experiments.controller'

const USER = '64b000000000000000000001'
const ORG = '64b000000000000000000010'
const PROJECT = '64b000000000000000000020'
const OTHER_PROJECT = '64b000000000000000000021'
const FLAG = '64b000000000000000000030'
const ENV = '64b000000000000000000040'
const EXP = '64b000000000000000000060'
const VARIANT = '64b000000000000000000070'

type Role = 'VIEWER' | 'MEMBER' | 'ADMIN' | 'OWNER' | null

/**
 * Uses the real AccessService against a mocked Prisma client so the tests
 * prove the controller actually enforces tenant isolation and roles.
 */
function setup(role: Role, opts: { envProject?: string } = {}) {
  const envProject = opts.envProject ?? PROJECT
  const prisma = {
    project: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: PROJECT, organizationId: ORG }),
    },
    featureFlag: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: FLAG,
          projectId: PROJECT,
          organizationId: ORG,
        }),
    },
    experiment: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: EXP,
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
  } as any

  const experimentsService = {
    create: jest.fn().mockResolvedValue({ id: EXP }),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: EXP }),
    update: jest.fn().mockResolvedValue({ id: EXP }),
    delete: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue({ id: EXP }),
    pause: jest.fn().mockResolvedValue({ id: EXP }),
    complete: jest.fn().mockResolvedValue({ id: EXP }),
    addVariant: jest.fn().mockResolvedValue({ id: VARIANT }),
    updateVariant: jest.fn().mockResolvedValue({ id: VARIANT }),
    deleteVariant: jest.fn().mockResolvedValue(undefined),
  } as any
  const resultsService = {
    getResults: jest.fn().mockResolvedValue({ variants: [] }),
  } as any

  const controller = new ExperimentsController(
    experimentsService,
    resultsService,
    new AccessService(prisma)
  )
  const req = { user: { userId: USER } }
  return { controller, experimentsService, resultsService, prisma, req }
}

const createDto = {
  name: 'Exp',
  key: 'exp',
  flagId: FLAG,
  environmentId: ENV,
}
const variantDto = { key: 'a', name: 'A', value: 'A', weight: 50 }

type Call = [string, (c: ExperimentsController, req: any) => Promise<unknown>]

const mutatingCalls: Call[] = [
  ['create', (c, req) => c.create(req, createDto)],
  ['update', (c, req) => c.update(EXP, { name: 'x' }, req)],
  ['delete', (c, req) => c.delete(EXP, req)],
  ['start', (c, req) => c.start(EXP, req)],
  ['pause', (c, req) => c.pause(EXP, req)],
  ['complete', (c, req) => c.complete(EXP, req)],
  ['addVariant', (c, req) => c.addVariant(EXP, variantDto, req)],
  [
    'updateVariant',
    (c, req) => c.updateVariant(EXP, VARIANT, { weight: 10 }, req),
  ],
  ['deleteVariant', (c, req) => c.deleteVariant(EXP, VARIANT, req)],
]

const readCalls: Call[] = [
  ['findAll', (c, req) => c.findAll(req, PROJECT)],
  ['findOne', (c, req) => c.findOne(EXP, req)],
  ['getResults', (c, req) => c.getResults(EXP, req)],
]

function expectUntouched(...services: Record<string, jest.Mock>[]) {
  for (const service of services) {
    for (const fn of Object.values(service)) {
      expect(fn).not.toHaveBeenCalled()
    }
  }
}

describe('ExperimentsController access control', () => {
  it.each([...readCalls, ...mutatingCalls])(
    'non-members get 404 on %s',
    async (_name, call) => {
      const { controller, experimentsService, resultsService, req } =
        setup(null)
      await expect(call(controller, req)).rejects.toBeInstanceOf(
        NotFoundException
      )
      expectUntouched(experimentsService, resultsService)
    }
  )

  it.each(mutatingCalls)('VIEWERs cannot %s', async (_name, call) => {
    const { controller, experimentsService, resultsService, req } =
      setup('VIEWER')
    await expect(call(controller, req)).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expectUntouched(experimentsService, resultsService)
  })

  it.each(readCalls)('VIEWERs can %s', async (_name, call) => {
    const { controller, req } = setup('VIEWER')
    await expect(call(controller, req)).resolves.toBeDefined()
  })

  it('MEMBERs can run the experiment lifecycle but not delete', async () => {
    const { controller, experimentsService, req } = setup('MEMBER')
    await controller.start(EXP, req)
    await controller.pause(EXP, req)
    await controller.complete(EXP, req)
    expect(experimentsService.start).toHaveBeenCalledWith(EXP, USER)
    expect(experimentsService.pause).toHaveBeenCalledWith(EXP, USER)
    expect(experimentsService.complete).toHaveBeenCalledWith(EXP, USER)

    await expect(controller.delete(EXP, req)).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expect(experimentsService.delete).not.toHaveBeenCalled()
  })

  it('ADMINs can delete and the audit user is req.user.userId', async () => {
    const { controller, experimentsService, req } = setup('ADMIN')
    await controller.delete(EXP, req)
    expect(experimentsService.delete).toHaveBeenCalledWith(EXP, USER)
  })

  it('create passes req.user.userId (not the undefined `sub`)', async () => {
    const { controller, experimentsService, req } = setup('MEMBER')
    await controller.create(req, createDto)
    expect(experimentsService.create).toHaveBeenCalledWith(USER, createDto)
  })

  it('create rejects an environment outside the flag project', async () => {
    const { controller, experimentsService, req } = setup('MEMBER', {
      envProject: OTHER_PROJECT,
    })
    await expect(controller.create(req, createDto)).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(experimentsService.create).not.toHaveBeenCalled()
  })

  it('findAll requires a valid projectId', async () => {
    const { controller, experimentsService, prisma, req } = setup('OWNER')
    await expect(
      controller.findAll(req, undefined as any)
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(controller.findAll(req, 'garbage')).rejects.toBeInstanceOf(
      BadRequestException
    )
    expect(prisma.project.findUnique).not.toHaveBeenCalled()
    expect(experimentsService.findAll).not.toHaveBeenCalled()
  })

  it('findAll forwards the status filter after the access check', async () => {
    const { controller, experimentsService, req } = setup('VIEWER')
    await controller.findAll(req, PROJECT, 'RUNNING' as any)
    expect(experimentsService.findAll).toHaveBeenCalledWith(PROJECT, 'RUNNING')
  })
})
