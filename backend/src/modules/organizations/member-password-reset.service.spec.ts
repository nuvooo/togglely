import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { OrganizationRole } from '@prisma/client'
import { AccessService } from '../../shared/access/access.service'
import {
  MemberPasswordResetService,
  RESET_REQUIRES_SERVER_ADMIN,
} from './member-password-reset.service'

const ORG = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER_ORG = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const OWNER = '000000000000000000000001'
const ADMIN = '000000000000000000000003'
const MEMBER = '000000000000000000000005'
const OUTSIDER = '000000000000000000000009'

type Member = { userId: string; organizationId: string; role: OrganizationRole }

function setup(
  members: Member[],
  inactive: string[] = [],
  expiresAt = new Date('2026-11-09T13:00:00.000Z')
) {
  const matches = (m: Member, where: any) =>
    (!where.userId || m.userId === where.userId) &&
    (!where.organizationId || m.organizationId === where.organizationId) &&
    (!where.role || m.role === where.role)

  const prisma = {
    organizationMember: {
      findFirst: jest.fn(
        async ({ where }: any) => members.find((m) => matches(m, where)) ?? null
      ),
      findMany: jest.fn(async ({ where }: any) =>
        members.filter((m) => matches(m, where))
      ),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) => ({
        id: where.id,
        isActive: !inactive.includes(where.id),
      })),
    },
  } as any
  const passwordReset = {
    createResetLink: jest.fn(async () => ({
      resetUrl: 'http://localhost:3000/reset-password?token=secret-token',
      expiresAt,
    })),
  } as any
  const audit = { create: jest.fn().mockResolvedValue({}) } as any
  const service = new MemberPasswordResetService(
    prisma,
    new AccessService(prisma),
    passwordReset,
    audit
  )
  return { service, prisma, passwordReset, audit }
}

const ORG_MEMBERS: Member[] = [
  { userId: OWNER, organizationId: ORG, role: 'OWNER' },
  { userId: ADMIN, organizationId: ORG, role: 'ADMIN' },
  { userId: MEMBER, organizationId: ORG, role: 'MEMBER' },
]

describe('MemberPasswordResetService.createLink', () => {
  it('hides the organization from non-members (404)', async () => {
    const { service, passwordReset } = setup(ORG_MEMBERS)
    await expect(
      service.createLink(ORG, OUTSIDER, MEMBER)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(passwordReset.createResetLink).not.toHaveBeenCalled()
  })

  it('forbids ADMINs (403)', async () => {
    const { service, passwordReset } = setup(ORG_MEMBERS)
    await expect(service.createLink(ORG, ADMIN, MEMBER)).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expect(passwordReset.createResetLink).not.toHaveBeenCalled()
  })

  it('returns 404 for invalid ObjectIds', async () => {
    const { service } = setup(ORG_MEMBERS)
    await expect(
      service.createLink('nope', OWNER, MEMBER)
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      service.createLink(ORG, OWNER, 'nope')
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('returns 404 when the target is not a member of the organization', async () => {
    const { service, passwordReset } = setup([
      ...ORG_MEMBERS,
      { userId: OUTSIDER, organizationId: OTHER_ORG, role: 'OWNER' },
    ])
    await expect(
      service.createLink(ORG, OWNER, OUTSIDER)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(passwordReset.createResetLink).not.toHaveBeenCalled()
  })

  it('lets an OWNER create a link for a member and returns it', async () => {
    const { service, passwordReset } = setup(ORG_MEMBERS)
    const result = await service.createLink(ORG, OWNER, MEMBER)
    expect(passwordReset.createResetLink).toHaveBeenCalledWith(MEMBER)
    expect(result).toEqual({
      resetUrl: 'http://localhost:3000/reset-password?token=secret-token',
      expiresAt: new Date('2026-11-09T13:00:00.000Z'),
    })
  })

  it('lets an OWNER create a link for themselves', async () => {
    const { service, passwordReset } = setup(ORG_MEMBERS)
    await service.createLink(ORG, OWNER, OWNER)
    expect(passwordReset.createResetLink).toHaveBeenCalledWith(OWNER)
  })

  it('refuses when the target also belongs to an org the actor does not own', async () => {
    const { service, passwordReset } = setup([
      ...ORG_MEMBERS,
      { userId: MEMBER, organizationId: OTHER_ORG, role: 'VIEWER' },
      // actor is only ADMIN there
      { userId: OWNER, organizationId: OTHER_ORG, role: 'ADMIN' },
    ])
    const error = await service.createLink(ORG, OWNER, MEMBER).catch((e) => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(error.getResponse()).toEqual(
      expect.objectContaining({
        code: RESET_REQUIRES_SERVER_ADMIN,
        message:
          'User also belongs to other organizations – ask the server administrator',
      })
    )
    expect(passwordReset.createResetLink).not.toHaveBeenCalled()
  })

  it('allows it when the actor owns every org of the target', async () => {
    const { service, passwordReset } = setup([
      ...ORG_MEMBERS,
      { userId: MEMBER, organizationId: OTHER_ORG, role: 'VIEWER' },
      { userId: OWNER, organizationId: OTHER_ORG, role: 'OWNER' },
    ])
    await service.createLink(ORG, OWNER, MEMBER)
    expect(passwordReset.createResetLink).toHaveBeenCalledWith(MEMBER)
  })

  it('refuses to reset a co-owner of the same organization (server admin only)', async () => {
    const CO_OWNER = '000000000000000000000002'
    const { service, passwordReset } = setup([
      ...ORG_MEMBERS,
      { userId: CO_OWNER, organizationId: ORG, role: 'OWNER' },
    ])
    const error = await service.createLink(ORG, OWNER, CO_OWNER).catch((e) => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: RESET_REQUIRES_SERVER_ADMIN })
    )
    expect(passwordReset.createResetLink).not.toHaveBeenCalled()
  })

  it('refuses when the target owns another organization the actor also owns', async () => {
    const { service, passwordReset } = setup([
      ...ORG_MEMBERS,
      { userId: MEMBER, organizationId: OTHER_ORG, role: 'OWNER' },
      { userId: OWNER, organizationId: OTHER_ORG, role: 'OWNER' },
    ])
    const error = await service.createLink(ORG, OWNER, MEMBER).catch((e) => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: RESET_REQUIRES_SERVER_ADMIN })
    )
    expect(passwordReset.createResetLink).not.toHaveBeenCalled()
  })

  it('still lets an OWNER reset their own account although they are an owner', async () => {
    const { service, passwordReset } = setup([
      ...ORG_MEMBERS,
      { userId: OWNER, organizationId: OTHER_ORG, role: 'OWNER' },
    ])
    await service.createLink(ORG, OWNER, OWNER)
    expect(passwordReset.createResetLink).toHaveBeenCalledWith(OWNER)
  })

  it('rejects deactivated users', async () => {
    const { service, passwordReset } = setup(ORG_MEMBERS, [MEMBER])
    await expect(
      service.createLink(ORG, OWNER, MEMBER)
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(passwordReset.createResetLink).not.toHaveBeenCalled()
  })

  it('writes an audit entry without the token', async () => {
    const { service, audit } = setup(ORG_MEMBERS)
    await service.createLink(ORG, OWNER, MEMBER)
    expect(audit.create).toHaveBeenCalledWith({
      action: 'user.password_reset_link_created',
      entityType: 'User',
      entityId: MEMBER,
      userId: OWNER,
      organizationId: ORG,
      newValues: { expiresAt: '2026-11-09T13:00:00.000Z' },
    })
    expect(JSON.stringify(audit.create.mock.calls)).not.toContain(
      'secret-token'
    )
  })
})
