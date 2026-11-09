import {
  ArgumentMetadata,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { CreateEnvironmentWithProjectDto } from './dto/create-environment.dto'
import { EnvironmentsController } from './environments.controller'
import { EnvironmentsService } from './environments.service'

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const PROJECT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const ORG_ID = 'cccccccccccccccccccccccc'
const OTHER_ORG_ID = 'dddddddddddddddddddddddd'
const ENV_ID = 'eeeeeeeeeeeeeeeeeeeeeeee'

const req = { user: { userId: USER_ID } }

function setup(role: string | null) {
  const prisma = {
    project: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: PROJECT_ID, organizationId: ORG_ID }),
    },
    environment: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: ENV_ID, projectId: PROJECT_ID }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) => data),
      update: jest.fn(),
      delete: jest.fn(),
    },
    flagEnvironment: { deleteMany: jest.fn() },
    organizationMember: {
      findFirst: jest
        .fn()
        .mockResolvedValue(role ? { userId: USER_ID, role } : null),
    },
  } as any
  const access = new AccessService(prisma)
  const service = new EnvironmentsService(prisma)
  const controller = new EnvironmentsController(service, access)
  return { controller, prisma }
}

describe('EnvironmentsController (access control)', () => {
  it.each([
    [
      'findByProject',
      (c: EnvironmentsController) => c.findByProject(PROJECT_ID, req),
    ],
    [
      'create',
      (c: EnvironmentsController) =>
        c.create(PROJECT_ID, { name: 'Staging', key: 'staging' }, req),
    ],
    [
      'createGlobal',
      (c: EnvironmentsController) =>
        c.createGlobal(
          { name: 'Staging', key: 'staging', projectId: PROJECT_ID },
          req
        ),
    ],
    [
      'update',
      (c: EnvironmentsController) => c.update(ENV_ID, { name: 'x' }, req),
    ],
    ['delete', (c: EnvironmentsController) => c.delete(ENV_ID, req)],
    [
      'reorder',
      (c: EnvironmentsController) =>
        c.reorder(PROJECT_ID, { environmentIds: [] }, req),
    ],
  ])('%s rejects non-members with 404', async (_name, call) => {
    const { controller, prisma } = setup(null)
    await expect(call(controller)).rejects.toThrow(NotFoundException)
    expect(prisma.environment.findMany).not.toHaveBeenCalled()
    expect(prisma.environment.create).not.toHaveBeenCalled()
    expect(prisma.environment.update).not.toHaveBeenCalled()
    expect(prisma.environment.delete).not.toHaveBeenCalled()
  })

  it.each(['VIEWER', 'MEMBER'])(
    'requires ADMIN for writes (%s rejected)',
    async (role) => {
      const { controller, prisma } = setup(role)
      await expect(
        controller.create(PROJECT_ID, { name: 'S', key: 's' }, req)
      ).rejects.toThrow(ForbiddenException)
      await expect(
        controller.update(ENV_ID, { name: 'x' }, req)
      ).rejects.toThrow(ForbiddenException)
      await expect(controller.delete(ENV_ID, req)).rejects.toThrow(
        ForbiddenException
      )
      expect(prisma.environment.create).not.toHaveBeenCalled()
      expect(prisma.environment.update).not.toHaveBeenCalled()
      expect(prisma.environment.delete).not.toHaveBeenCalled()
    }
  )

  it('allows VIEWER to list environments', async () => {
    const { controller } = setup('VIEWER')
    await expect(controller.findByProject(PROJECT_ID, req)).resolves.toEqual({
      environments: [],
    })
  })

  it('derives organizationId from the project, ignoring the request body', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true })
    const meta: ArgumentMetadata = {
      type: 'body',
      metatype: CreateEnvironmentWithProjectDto,
      data: '',
    }
    const dto = await pipe.transform(
      {
        name: 'Staging',
        key: 'staging',
        projectId: PROJECT_ID,
        organizationId: OTHER_ORG_ID,
      },
      meta
    )
    expect(dto).not.toHaveProperty('organizationId')

    const { controller, prisma } = setup('ADMIN')
    await controller.createGlobal(
      { ...dto, organizationId: OTHER_ORG_ID } as any,
      req
    )

    expect(prisma.environment.create).toHaveBeenCalledWith({
      data: {
        name: 'Staging',
        key: 'staging',
        projectId: PROJECT_ID,
        organizationId: ORG_ID,
      },
    })
  })
})
