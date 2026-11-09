import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { OrganizationRole } from '@prisma/client'
import { AccessService } from '../../shared/access/access.service'
import { OrganizationInvitesService } from './organization-invites.service'
import { OrganizationsController } from './organizations.controller'
import { OrganizationsService } from './organizations.service'

const ORG = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const OWNER = '000000000000000000000001'
const OWNER2 = '000000000000000000000002'
const ADMIN = '000000000000000000000003'
const ADMIN2 = '000000000000000000000004'
const MEMBER = '000000000000000000000005'
const VIEWER = '000000000000000000000006'
const OUTSIDER = '000000000000000000000009'

type Member = {
  id: string
  userId: string
  organizationId: string
  role: OrganizationRole
}

function setup(roles: Record<string, OrganizationRole>) {
  let members: Member[] = Object.entries(roles).map(([userId, role]) => ({
    id: `m-${userId}`,
    userId,
    organizationId: ORG,
    role,
  }))

  const matches = (m: Member, where: any) =>
    (!where.userId || m.userId === where.userId) &&
    (!where.organizationId || m.organizationId === where.organizationId) &&
    (!where.role || m.role === where.role)

  const prisma = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: ORG, name: 'Org' }),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.email === 'new@example.com'
          ? { id: OUTSIDER, email: 'new@example.com' }
          : null
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    organizationMember: {
      findFirst: jest.fn(
        async ({ where }: any) => members.find((m) => matches(m, where)) ?? null
      ),
      count: jest.fn(
        async ({ where }: any) =>
          members.filter((m) => matches(m, where)).length
      ),
      create: jest.fn(async ({ data }: any) => ({ id: 'm-new', ...data })),
      update: jest.fn(async ({ where, data }: any) => {
        const m = members.find((x) => x.id === where.id)!
        m.role = data.role
        return { ...m, user: { id: m.userId, email: 'x@example.com' } }
      }),
      delete: jest.fn(async ({ where }: any) => {
        members = members.filter((m) => m.id !== where.id)
      }),
    },
    organizationInvite: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: 'inv-1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  } as any

  const mail = {
    isEnabled: jest.fn().mockReturnValue(true),
    sendInviteEmail: jest.fn().mockResolvedValue(true),
  } as any
  const config = {
    get: jest.fn((key: string) =>
      key === 'FRONTEND_URL' ? 'http://localhost:3000' : undefined
    ),
  } as any
  const audit = { create: jest.fn().mockResolvedValue({}) } as any
  const access = new AccessService(prisma)
  const service = new OrganizationsService(prisma)
  const invites = new OrganizationInvitesService(prisma, mail, config, audit)
  const memberPasswordReset = {
    createLink: jest.fn().mockResolvedValue({
      resetUrl: 'http://localhost:3000/reset-password?token=t',
      expiresAt: new Date(0),
    }),
  } as any
  const controller = new OrganizationsController(
    service,
    access,
    invites,
    memberPasswordReset
  )
  const req = (userId: string) => ({ user: { userId } })
  const roleOf = (userId: string) =>
    members.find((m) => m.userId === userId)?.role

  return { controller, prisma, mail, req, roleOf, memberPasswordReset }
}

const DEFAULT_ROLES: Record<string, OrganizationRole> = {
  [OWNER]: 'OWNER',
  [ADMIN]: 'ADMIN',
  [ADMIN2]: 'ADMIN',
  [MEMBER]: 'MEMBER',
  [VIEWER]: 'VIEWER',
}

describe('OrganizationsController - access control', () => {
  describe('organization routes', () => {
    it('hides organizations from non-members (404)', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.findOne(ORG, req(OUTSIDER))
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        controller.getMembers(ORG, req(OUTSIDER))
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('requires ADMIN to update and OWNER to delete', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.update(ORG, { name: 'x' }, req(MEMBER))
      ).rejects.toBeInstanceOf(ForbiddenException)
      await expect(controller.delete(ORG, req(ADMIN))).rejects.toBeInstanceOf(
        ForbiddenException
      )
    })
  })

  describe('addMember', () => {
    it('rejects non-members and non-admins', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.addMember(ORG, { email: 'new@example.com' }, req(OUTSIDER))
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        controller.addMember(ORG, { email: 'new@example.com' }, req(MEMBER))
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('prevents an ADMIN from granting OWNER or ADMIN', async () => {
      const { controller, req, prisma } = setup(DEFAULT_ROLES)
      for (const role of ['OWNER', 'ADMIN'] as const) {
        await expect(
          controller.addMember(
            ORG,
            { email: 'new@example.com', role },
            req(ADMIN)
          )
        ).rejects.toBeInstanceOf(ForbiddenException)
      }
      expect(prisma.organizationMember.create).not.toHaveBeenCalled()
    })

    it('lets an ADMIN add a VIEWER', async () => {
      const { controller, req, prisma } = setup(DEFAULT_ROLES)
      await controller.addMember(
        ORG,
        { email: 'new@example.com', role: 'VIEWER' },
        req(ADMIN)
      )
      expect(prisma.organizationMember.create.mock.calls[0][0].data.role).toBe(
        'VIEWER'
      )
    })

    it('lets an OWNER grant ADMIN', async () => {
      const { controller, req, prisma } = setup(DEFAULT_ROLES)
      await controller.addMember(
        ORG,
        { email: 'new@example.com', role: 'ADMIN' },
        req(OWNER)
      )
      expect(prisma.organizationMember.create.mock.calls[0][0].data.role).toBe(
        'ADMIN'
      )
    })
  })

  describe('updateMember', () => {
    it('forbids changing your own role', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.updateMember(ORG, ADMIN, { role: 'OWNER' }, req(ADMIN))
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('forbids an ADMIN from promoting anyone to ADMIN or OWNER', async () => {
      const { controller, req, roleOf } = setup(DEFAULT_ROLES)
      await expect(
        controller.updateMember(ORG, MEMBER, { role: 'OWNER' }, req(ADMIN))
      ).rejects.toBeInstanceOf(ForbiddenException)
      await expect(
        controller.updateMember(ORG, MEMBER, { role: 'ADMIN' }, req(ADMIN))
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(roleOf(MEMBER)).toBe('MEMBER')
    })

    it('forbids an ADMIN from demoting another ADMIN or the OWNER', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.updateMember(ORG, ADMIN2, { role: 'MEMBER' }, req(ADMIN))
      ).rejects.toBeInstanceOf(ForbiddenException)
      await expect(
        controller.updateMember(ORG, OWNER, { role: 'MEMBER' }, req(ADMIN))
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('lets an ADMIN switch MEMBER <-> VIEWER', async () => {
      const { controller, req, roleOf } = setup(DEFAULT_ROLES)
      await controller.updateMember(ORG, MEMBER, { role: 'VIEWER' }, req(ADMIN))
      expect(roleOf(MEMBER)).toBe('VIEWER')
    })

    it('forbids MEMBERs from changing roles', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.updateMember(ORG, VIEWER, { role: 'MEMBER' }, req(MEMBER))
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('lets an OWNER promote to ADMIN and OWNER', async () => {
      const { controller, req, roleOf } = setup(DEFAULT_ROLES)
      await controller.updateMember(ORG, MEMBER, { role: 'ADMIN' }, req(OWNER))
      expect(roleOf(MEMBER)).toBe('ADMIN')
      await controller.updateMember(ORG, ADMIN, { role: 'OWNER' }, req(OWNER))
      expect(roleOf(ADMIN)).toBe('OWNER')
    })

    it('lets an OWNER demote another OWNER when more owners remain', async () => {
      const { controller, req, roleOf } = setup({
        ...DEFAULT_ROLES,
        [OWNER2]: 'OWNER',
      })
      await controller.updateMember(ORG, OWNER2, { role: 'ADMIN' }, req(OWNER))
      expect(roleOf(OWNER2)).toBe('ADMIN')
    })

    it('returns 404 for invalid or unknown member ids', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.updateMember(
          ORG,
          'not-an-id',
          { role: 'VIEWER' },
          req(OWNER)
        )
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        controller.updateMember(ORG, OUTSIDER, { role: 'VIEWER' }, req(OWNER))
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('removeMember', () => {
    it('rejects outsiders and plain members removing others', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.removeMember(ORG, VIEWER, req(OUTSIDER))
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        controller.removeMember(ORG, VIEWER, req(MEMBER))
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('lets an ADMIN remove MEMBERs but not ADMINs or OWNERs', async () => {
      const { controller, req, roleOf } = setup(DEFAULT_ROLES)
      await controller.removeMember(ORG, MEMBER, req(ADMIN))
      expect(roleOf(MEMBER)).toBeUndefined()
      await expect(
        controller.removeMember(ORG, ADMIN2, req(ADMIN))
      ).rejects.toBeInstanceOf(ForbiddenException)
      await expect(
        controller.removeMember(ORG, OWNER, req(ADMIN))
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('lets an OWNER remove an ADMIN', async () => {
      const { controller, req, roleOf } = setup(DEFAULT_ROLES)
      await controller.removeMember(ORG, ADMIN, req(OWNER))
      expect(roleOf(ADMIN)).toBeUndefined()
    })

    it('lets any member leave, except the last OWNER', async () => {
      const { controller, req, roleOf } = setup(DEFAULT_ROLES)
      await controller.removeMember(ORG, VIEWER, req(VIEWER))
      expect(roleOf(VIEWER)).toBeUndefined()
      await expect(
        controller.removeMember(ORG, OWNER, req(OWNER))
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(roleOf(OWNER)).toBe('OWNER')
    })

    it('lets an OWNER leave when another OWNER remains', async () => {
      const { controller, req, roleOf } = setup({
        ...DEFAULT_ROLES,
        [OWNER2]: 'OWNER',
      })
      await controller.removeMember(ORG, OWNER, req(OWNER))
      expect(roleOf(OWNER)).toBeUndefined()
    })

    it('returns 404 for invalid member ids', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.removeMember(ORG, 'garbage', req(OWNER))
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('invites', () => {
    it('prevents ADMINs from inviting ADMINs or OWNERs', async () => {
      const { controller, req, prisma } = setup(DEFAULT_ROLES)
      await expect(
        controller.createInvite(
          ORG,
          { email: 'someone@example.com', role: 'OWNER' },
          req(ADMIN)
        )
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(prisma.organizationInvite.create).not.toHaveBeenCalled()
    })

    it('rejects invites from MEMBERs', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.createInvite(
          ORG,
          { email: 'someone@example.com' },
          req(MEMBER)
        )
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('creates an invite and returns the absolute invite url', async () => {
      const { controller, req, prisma, mail } = setup(DEFAULT_ROLES)
      const result = await controller.createInvite(
        ORG,
        { email: 'someone@example.com', role: 'VIEWER' },
        req(ADMIN)
      )
      expect(prisma.organizationInvite.create.mock.calls[0][0].data.role).toBe(
        'VIEWER'
      )
      expect(mail.sendInviteEmail).toHaveBeenCalled()
      expect(result.inviteUrl).toMatch(
        /^http:\/\/localhost:3000\/invite\/[a-f0-9]{64}$/
      )
      expect(result.emailSent).toBe(true)
      expect((result as any).inviteToken).toBeUndefined()
    })

    it('lets an ADMIN create an unbound link invite', async () => {
      const { controller, req, mail } = setup(DEFAULT_ROLES)
      const result = await controller.createInvite(ORG, {}, req(ADMIN))
      expect(result.invite.email).toBeNull()
      expect(result.emailSent).toBe(false)
      expect(mail.sendInviteEmail).not.toHaveBeenCalled()
    })

    it('requires ADMIN to list invites', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.getInvites(ORG, req(MEMBER))
      ).rejects.toBeInstanceOf(ForbiddenException)
      await expect(controller.getInvites(ORG, req(ADMIN))).resolves.toEqual({
        invites: [],
      })
    })

    it('requires ADMIN to revoke invites', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.cancelInvite(ORG, OUTSIDER, req(MEMBER))
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('returns 404 when cancelling an unknown or invalid invite', async () => {
      const { controller, req } = setup(DEFAULT_ROLES)
      await expect(
        controller.cancelInvite(ORG, 'bad', req(ADMIN))
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        controller.cancelInvite(ORG, OUTSIDER, req(ADMIN))
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('createPasswordResetLink', () => {
    it('delegates to the member password reset service with the actor', async () => {
      const { controller, req, memberPasswordReset } = setup(DEFAULT_ROLES)
      const result = await controller.createPasswordResetLink(
        ORG,
        MEMBER,
        req(OWNER)
      )
      expect(memberPasswordReset.createLink).toHaveBeenCalledWith(
        ORG,
        OWNER,
        MEMBER
      )
      expect(result).toEqual({
        resetUrl: 'http://localhost:3000/reset-password?token=t',
        expiresAt: new Date(0),
      })
    })

    it('is throttled to 10 requests per 15 minutes', () => {
      const proto = OrganizationsController.prototype as any
      const handler = proto.createPasswordResetLink
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(10)
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(900000)
    })
  })
})
