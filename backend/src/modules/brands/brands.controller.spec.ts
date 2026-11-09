import {
  ArgumentMetadata,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { BrandsController } from './brands.controller'
import { BrandsService } from './brands.service'
import { ToggleBrandFlagDto } from './dto/toggle-brand-flag.dto'

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const PROJECT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const OTHER_PROJECT_ID = 'b0b0b0b0b0b0b0b0b0b0b0b0'
const ORG_ID = 'cccccccccccccccccccccccc'
const BRAND_ID = '111111111111111111111111'
const FLAG_ID = '222222222222222222222222'
const ENV_ID = '333333333333333333333333'

const req = { user: { userId: USER_ID } }

function setup(
  role: string | null,
  opts: { flagProjectId?: string; envInProject?: boolean } = {}
) {
  const prisma = {
    project: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => ({
        id: where.id,
        organizationId: ORG_ID,
      })),
    },
    brand: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: BRAND_ID, projectId: PROJECT_ID }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    featureFlag: {
      findUnique: jest.fn().mockResolvedValue({
        id: FLAG_ID,
        projectId: opts.flagProjectId ?? PROJECT_ID,
        organizationId: ORG_ID,
        flagType: 'BOOLEAN',
      }),
    },
    environment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.envInProject === false ? null : { id: ENV_ID }),
    },
    flagEnvironment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'fe-1', enabled: true }),
      update: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
    targetingRule: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
    },
    ruleCondition: { deleteMany: jest.fn() },
    organizationMember: {
      findFirst: jest
        .fn()
        .mockResolvedValue(role ? { userId: USER_ID, role } : null),
    },
    $transaction: jest.fn(),
  } as any
  prisma.$transaction.mockImplementation((cb: any) => cb(prisma))
  const auditLogs = { create: jest.fn() } as any
  const access = new AccessService(prisma)
  const service = new BrandsService(prisma, auditLogs)
  const controller = new BrandsController(service, access)
  return { controller, prisma, auditLogs }
}

const toggleBody = { environmentId: ENV_ID, enabled: true }

describe('BrandsController (access control)', () => {
  it.each([
    [
      'findByProject',
      (c: BrandsController) => c.findByProject(PROJECT_ID, req),
    ],
    ['findFlags', (c: BrandsController) => c.findFlags(BRAND_ID, req)],
    [
      'toggleFlag',
      (c: BrandsController) => c.toggleFlag(BRAND_ID, FLAG_ID, toggleBody, req),
    ],
    [
      'create',
      (c: BrandsController) =>
        c.create(PROJECT_ID, { name: 'Brand', key: 'brand' }, req),
    ],
    ['update', (c: BrandsController) => c.update(BRAND_ID, { name: 'x' }, req)],
    ['delete', (c: BrandsController) => c.delete(BRAND_ID, req)],
  ])('%s rejects non-members with 404', async (_name, call) => {
    const { controller, prisma } = setup(null)
    await expect(call(controller)).rejects.toThrow(NotFoundException)
    expect(prisma.brand.findMany).not.toHaveBeenCalled()
    expect(prisma.brand.create).not.toHaveBeenCalled()
    expect(prisma.brand.update).not.toHaveBeenCalled()
    expect(prisma.brand.delete).not.toHaveBeenCalled()
    expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
    expect(prisma.flagEnvironment.update).not.toHaveBeenCalled()
  })

  it('requires ADMIN for brand CRUD', async () => {
    const { controller, prisma } = setup('MEMBER')
    await expect(
      controller.create(PROJECT_ID, { name: 'Brand', key: 'brand' }, req)
    ).rejects.toThrow(ForbiddenException)
    await expect(
      controller.update(BRAND_ID, { name: 'x' }, req)
    ).rejects.toThrow(ForbiddenException)
    await expect(controller.delete(BRAND_ID, req)).rejects.toThrow(
      ForbiddenException
    )
    expect(prisma.brand.create).not.toHaveBeenCalled()
    expect(prisma.brand.update).not.toHaveBeenCalled()
    expect(prisma.brand.delete).not.toHaveBeenCalled()
  })

  it('requires MEMBER to toggle a brand flag', async () => {
    const { controller, prisma } = setup('VIEWER')
    await expect(
      controller.toggleFlag(BRAND_ID, FLAG_ID, toggleBody, req)
    ).rejects.toThrow(ForbiddenException)
    expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
  })

  it('allows MEMBER to toggle when brand, flag and env share a project', async () => {
    const { controller, prisma } = setup('MEMBER')
    await controller.toggleFlag(BRAND_ID, FLAG_ID, toggleBody, req)
    expect(prisma.environment.findFirst).toHaveBeenCalledWith({
      where: { id: ENV_ID, projectId: PROJECT_ID },
      select: { id: true },
    })
    expect(prisma.flagEnvironment.create).toHaveBeenCalled()
  })

  it('rejects toggling a flag from another project', async () => {
    const { controller, prisma } = setup('OWNER', {
      flagProjectId: OTHER_PROJECT_ID,
    })
    await expect(
      controller.toggleFlag(BRAND_ID, FLAG_ID, toggleBody, req)
    ).rejects.toThrow(NotFoundException)
    expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
  })

  it('rejects an environment from another project', async () => {
    const { controller, prisma } = setup('OWNER', { envInProject: false })
    await expect(
      controller.toggleFlag(BRAND_ID, FLAG_ID, toggleBody, req)
    ).rejects.toThrow(NotFoundException)
    expect(prisma.flagEnvironment.create).not.toHaveBeenCalled()
  })
})

describe('BrandsController.resetFlagOverride', () => {
  const reset = (c: BrandsController, envId = ENV_ID) =>
    c.resetFlagOverride(BRAND_ID, FLAG_ID, envId, req)

  it('rejects non-members with 404', async () => {
    const { controller, prisma } = setup(null)
    await expect(reset(controller)).rejects.toThrow(NotFoundException)
    expect(prisma.flagEnvironment.delete).not.toHaveBeenCalled()
  })

  it('requires MEMBER (VIEWER gets 403)', async () => {
    const { controller, prisma } = setup('VIEWER')
    await expect(reset(controller)).rejects.toThrow(ForbiddenException)
    expect(prisma.flagEnvironment.delete).not.toHaveBeenCalled()
  })

  it('rejects invalid ids with 404', async () => {
    const { controller, prisma } = setup('OWNER')
    await expect(
      controller.resetFlagOverride('nope', FLAG_ID, ENV_ID, req)
    ).rejects.toThrow(NotFoundException)
    await expect(
      controller.resetFlagOverride(BRAND_ID, 'nope', ENV_ID, req)
    ).rejects.toThrow(NotFoundException)
    await expect(reset(controller, 'nope')).rejects.toThrow(NotFoundException)
    expect(prisma.flagEnvironment.delete).not.toHaveBeenCalled()
  })

  it('rejects a flag from another project', async () => {
    const { controller, prisma } = setup('OWNER', {
      flagProjectId: OTHER_PROJECT_ID,
    })
    await expect(reset(controller)).rejects.toThrow(NotFoundException)
    expect(prisma.flagEnvironment.delete).not.toHaveBeenCalled()
  })

  it('rejects an environment from another project', async () => {
    const { controller, prisma } = setup('OWNER', { envInProject: false })
    await expect(reset(controller)).rejects.toThrow(NotFoundException)
    expect(prisma.flagEnvironment.delete).not.toHaveBeenCalled()
  })

  it('deletes only that brand row and audit-logs it', async () => {
    const { controller, prisma, auditLogs } = setup('MEMBER')
    prisma.flagEnvironment.findFirst.mockResolvedValue({
      id: 'fe-brand',
      brandId: BRAND_ID,
      enabled: true,
      defaultValue: 'true',
    })
    prisma.targetingRule.findMany.mockResolvedValue([{ id: 'r1' }])

    const result = await reset(controller)

    expect(prisma.flagEnvironment.findFirst).toHaveBeenCalledWith({
      where: { flagId: FLAG_ID, environmentId: ENV_ID, brandId: BRAND_ID },
    })
    expect(prisma.flagEnvironment.delete).toHaveBeenCalledTimes(1)
    expect(prisma.flagEnvironment.delete).toHaveBeenCalledWith({
      where: { id: 'fe-brand' },
    })
    expect(prisma.flagEnvironment.deleteMany).not.toHaveBeenCalled()
    expect(prisma.targetingRule.deleteMany).toHaveBeenCalledWith({
      where: { flagEnvId: 'fe-brand' },
    })
    expect(prisma.ruleCondition.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: { in: ['r1'] } },
    })
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'flag.brand_override_reset',
        userId: USER_ID,
        projectId: PROJECT_ID,
      })
    )
    expect(result).toEqual(
      expect.objectContaining({ inherited: true, deleted: true })
    )
  })

  it('is a no-op when the brand already inherits', async () => {
    const { controller, prisma, auditLogs } = setup('MEMBER')
    const result = await reset(controller)
    expect(prisma.flagEnvironment.delete).not.toHaveBeenCalled()
    expect(auditLogs.create).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({ inherited: true, deleted: false })
    )
  })
})

describe('ToggleBrandFlagDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true })
  const meta: ArgumentMetadata = {
    type: 'body',
    metatype: ToggleBrandFlagDto,
    data: '',
  }

  it('rejects operator objects in environmentId (NoSQL injection)', async () => {
    await expect(
      pipe.transform({ environmentId: { not: 'x' }, enabled: true }, meta)
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects non-boolean enabled', async () => {
    await expect(
      pipe.transform({ environmentId: ENV_ID, enabled: 'yes' }, meta)
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepts the frontend payload', async () => {
    await expect(pipe.transform(toggleBody, meta)).resolves.toEqual(toggleBody)
  })
})
