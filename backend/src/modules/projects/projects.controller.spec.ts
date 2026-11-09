import {
  ArgumentMetadata,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { ImportFlagsDto } from './dto/import-flags.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const PROJECT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const ORG_ID = 'cccccccccccccccccccccccc'
const OTHER_ORG_ID = 'dddddddddddddddddddddddd'

const req = { user: { userId: USER_ID } }

function setup(role: string | null) {
  const prisma = {
    project: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: PROJECT_ID, organizationId: ORG_ID }),
      update: jest.fn().mockImplementation(({ data }: any) => ({
        id: PROJECT_ID,
        key: 'p',
        organizationId: ORG_ID,
        environments: [],
        ...data,
      })),
    },
    organizationMember: {
      findFirst: jest
        .fn()
        .mockResolvedValue(role ? { userId: USER_ID, role } : null),
    },
  } as any
  const access = new AccessService(prisma)
  const service = new ProjectsService(prisma)
  const controller = new ProjectsController(service, access)
  return { controller, service, prisma }
}

const pipe = new ValidationPipe({ whitelist: true, transform: true })
function validate<T>(metatype: new () => T, value: unknown): Promise<T> {
  const meta: ArgumentMetadata = { type: 'body', metatype, data: '' }
  return pipe.transform(value, meta)
}

describe('ProjectsController (access control)', () => {
  it.each([
    ['findOne', (c: ProjectsController) => c.findOne(PROJECT_ID, req)],
    [
      'getFlagsWithBrands',
      (c: ProjectsController) => c.getFlagsWithBrands(PROJECT_ID, req),
    ],
    [
      'getEnvironments',
      (c: ProjectsController) => c.getEnvironments(PROJECT_ID, req),
    ],
    [
      'findByOrganization',
      (c: ProjectsController) => c.findByOrganization(ORG_ID, req),
    ],
    [
      'update',
      (c: ProjectsController) => c.update(PROJECT_ID, { name: 'x' }, req),
    ],
    ['delete', (c: ProjectsController) => c.delete(PROJECT_ID, req)],
    [
      'exportFlags',
      (c: ProjectsController) => c.exportFlags(PROJECT_ID, req, {} as any),
    ],
    [
      'importFlags',
      (c: ProjectsController) => c.importFlags(PROJECT_ID, { flags: [] }, req),
    ],
  ])('%s rejects non-members with 404', async (_name, call) => {
    const { controller, service } = setup(null)
    const spies = [
      jest.spyOn(service, 'findOne'),
      jest.spyOn(service, 'getFlagsWithBrands'),
      jest.spyOn(service, 'getEnvironments'),
      jest.spyOn(service, 'findByOrganization'),
      jest.spyOn(service, 'update'),
      jest.spyOn(service, 'delete'),
      jest.spyOn(service, 'exportFlags'),
      jest.spyOn(service, 'importFlags'),
    ]

    await expect(call(controller)).rejects.toThrow(NotFoundException)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('rejects invalid ObjectId params with 404 instead of 500', async () => {
    const { controller, prisma } = setup('OWNER')
    await expect(controller.findOne('not-an-id', req)).rejects.toThrow(
      NotFoundException
    )
    expect(prisma.project.findUnique).not.toHaveBeenCalled()
  })

  it('requires ADMIN to update a project', async () => {
    const { controller, prisma } = setup('MEMBER')
    await expect(
      controller.update(PROJECT_ID, { name: 'x' }, req)
    ).rejects.toThrow(ForbiddenException)
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it('requires ADMIN to import flags', async () => {
    const { controller, service } = setup('VIEWER')
    const spy = jest.spyOn(service, 'importFlags')
    await expect(
      controller.importFlags(PROJECT_ID, { flags: [] }, req)
    ).rejects.toThrow(ForbiddenException)
    expect(spy).not.toHaveBeenCalled()
  })

  it('allows VIEWER to read a project', async () => {
    const { controller, service } = setup('VIEWER')
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: PROJECT_ID } as any)
    await expect(controller.findOne(PROJECT_ID, req)).resolves.toEqual({
      project: { id: PROJECT_ID },
    })
  })
})

describe('PATCH /projects/:id mass assignment', () => {
  it('strips organizationId/key from the body via the DTO', async () => {
    const dto = await validate(UpdateProjectDto, {
      name: 'Renamed',
      organizationId: OTHER_ORG_ID,
      key: 'hijacked',
      id: 'eeeeeeeeeeeeeeeeeeeeeeee',
    })
    expect(dto).toEqual({ name: 'Renamed' })
  })

  it('never forwards organizationId to prisma even if it reaches the service', async () => {
    const { controller, prisma } = setup('ADMIN')
    const body = {
      name: 'Renamed',
      organizationId: OTHER_ORG_ID,
      key: 'hijacked',
    } as unknown as UpdateProjectDto

    const { project } = await controller.update(PROJECT_ID, body, req)

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      data: { name: 'Renamed' },
      include: { environments: true },
    })
    expect(project.organizationId).toBe(ORG_ID)
  })

  it('rejects an invalid project type', async () => {
    await expect(
      validate(UpdateProjectDto, { type: 'EVIL' })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects non-string allowedOrigins', async () => {
    await expect(
      validate(UpdateProjectDto, { allowedOrigins: [{ $ne: 1 }] })
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('ImportFlagsDto', () => {
  const validFlag = {
    key: 'new-feature',
    name: 'New Feature',
    flagType: 'BOOLEAN',
    environments: [
      { environmentKey: 'production', enabled: true, defaultValue: 'true' },
    ],
  }

  it('accepts a valid export payload', async () => {
    const dto = await validate(ImportFlagsDto, {
      flags: [validFlag],
      options: { skipExisting: true },
    })
    expect(dto.flags[0].key).toBe('new-feature')
  })

  it('rejects an unknown flagType', async () => {
    await expect(
      validate(ImportFlagsDto, { flags: [{ ...validFlag, flagType: 'EVIL' }] })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects object-valued keys (operator injection)', async () => {
    await expect(
      validate(ImportFlagsDto, {
        flags: [{ ...validFlag, key: { not: 'x' } }],
      })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects keys with invalid characters', async () => {
    await expect(
      validate(ImportFlagsDto, { flags: [{ ...validFlag, key: 'a b"c' }] })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects more than 1000 flags', async () => {
    const flags = Array.from({ length: 1001 }, (_, i) => ({
      ...validFlag,
      key: `flag-${i}`,
    }))
    await expect(validate(ImportFlagsDto, { flags })).rejects.toBeInstanceOf(
      BadRequestException
    )
  })
})
