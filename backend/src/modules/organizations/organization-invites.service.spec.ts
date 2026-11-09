import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { hashToken } from '../../shared/utils'
import { OrganizationInvitesService } from './organization-invites.service'

const ORG = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const ADMIN_ID = '000000000000000000000003'
const OWNER_ID = '000000000000000000000001'
const INVITE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const DAY = 24 * 60 * 60 * 1000

function createService(opts: { mailEnabled?: boolean } = {}) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: ORG, name: 'Acme' }),
    },
    organizationMember: { findFirst: jest.fn().mockResolvedValue(null) },
    organizationInvite: {
      create: jest.fn(async ({ data }: any) => ({
        id: INVITE_ID,
        createdAt: new Date(),
        acceptedAt: null,
        revokedAt: null,
        ...data,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  } as any
  const mail = {
    isEnabled: jest.fn().mockReturnValue(opts.mailEnabled ?? false),
    sendInviteEmail: jest.fn().mockResolvedValue(true),
  } as any
  const config = {
    get: jest.fn((key: string) =>
      key === 'FRONTEND_URL' ? 'https://flags.example.com/' : undefined
    ),
  } as any
  const audit = { create: jest.fn().mockResolvedValue({}) } as any
  const service = new OrganizationInvitesService(prisma, mail, config, audit)
  return { service, prisma, mail, audit }
}

const admin = { userId: ADMIN_ID, role: 'ADMIN' as const }
const owner = { userId: OWNER_ID, role: 'OWNER' as const }

describe('OrganizationInvitesService', () => {
  describe('create', () => {
    it('creates an unbound link invite with a hashed token', async () => {
      const { service, prisma, mail, audit } = createService()

      const result = await service.create(ORG, admin, {})

      const match = result.inviteUrl.match(
        /^https:\/\/flags\.example\.com\/invite\/([a-f0-9]{64})$/
      )
      expect(match).not.toBeNull()
      const token = match![1]

      const data = prisma.organizationInvite.create.mock.calls[0][0].data
      expect(data).toMatchObject({
        email: null,
        organizationId: ORG,
        role: 'MEMBER',
        tokenHash: hashToken(token),
        createdById: ADMIN_ID,
      })
      expect(data.token).toBeUndefined()
      const ttl = data.expiresAt.getTime() - Date.now()
      expect(ttl).toBeGreaterThan(7 * DAY - 60000)
      expect(ttl).toBeLessThanOrEqual(7 * DAY)

      expect(result.emailSent).toBe(false)
      expect(result.invite).toEqual({
        id: INVITE_ID,
        email: null,
        role: 'MEMBER',
        expiresAt: data.expiresAt,
      })
      expect(JSON.stringify(result)).not.toContain(hashToken(token))
      expect(mail.sendInviteEmail).not.toHaveBeenCalled()
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'invite.created',
          entityId: INVITE_ID,
          userId: ADMIN_ID,
          organizationId: ORG,
        })
      )
    })

    it('does not email a bound invite when SMTP is disabled', async () => {
      const { service, mail } = createService({ mailEnabled: false })
      const result = await service.create(ORG, admin, {
        email: 'new@example.com',
        role: 'VIEWER',
      })
      expect(result.emailSent).toBe(false)
      expect(result.invite.email).toBe('new@example.com')
      expect(result.invite.role).toBe('VIEWER')
      expect(mail.sendInviteEmail).not.toHaveBeenCalled()
    })

    it('emails a bound invite when SMTP is enabled', async () => {
      const { service, mail } = createService({ mailEnabled: true })
      const result = await service.create(ORG, admin, {
        email: 'new@example.com',
      })
      const token = result.inviteUrl.split('/').pop()
      expect(mail.sendInviteEmail).toHaveBeenCalledWith(
        'new@example.com',
        token,
        'Acme',
        'https://flags.example.com'
      )
      expect(result.emailSent).toBe(true)
    })

    it('reports emailSent=false when sending fails', async () => {
      const { service, mail } = createService({ mailEnabled: true })
      mail.sendInviteEmail.mockResolvedValue(false)
      const result = await service.create(ORG, admin, {
        email: 'new@example.com',
      })
      expect(result.emailSent).toBe(false)
    })

    it('rejects inviting an existing member (409)', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' })
      prisma.organizationMember.findFirst.mockResolvedValue({ id: 'm1' })
      await expect(
        service.create(ORG, admin, { email: 'member@example.com' })
      ).rejects.toBeInstanceOf(ConflictException)
      expect(prisma.organizationInvite.create).not.toHaveBeenCalled()
    })

    it('revokes an open invite for the same email and creates a new one', async () => {
      const { service, prisma } = createService()
      await service.create(ORG, admin, { email: 'again@example.com' })
      const revoke = prisma.organizationInvite.updateMany.mock.calls[0][0]
      expect(revoke.where).toMatchObject({
        organizationId: ORG,
        email: 'again@example.com',
      })
      expect(revoke.data.revokedAt).toBeInstanceOf(Date)
      expect(prisma.organizationInvite.create).toHaveBeenCalledTimes(1)
    })

    it('does not revoke anything for unbound invites', async () => {
      const { service, prisma } = createService()
      await service.create(ORG, admin, {})
      expect(prisma.organizationInvite.updateMany).not.toHaveBeenCalled()
    })

    it('prevents ADMINs from inviting ADMINs or OWNERs', async () => {
      const { service, prisma } = createService()
      for (const role of ['ADMIN', 'OWNER'] as const) {
        await expect(
          service.create(ORG, admin, { role })
        ).rejects.toBeInstanceOf(ForbiddenException)
      }
      expect(prisma.organizationInvite.create).not.toHaveBeenCalled()
    })

    it('lets OWNERs invite ADMINs', async () => {
      const { service } = createService()
      const result = await service.create(ORG, owner, { role: 'ADMIN' })
      expect(result.invite.role).toBe('ADMIN')
    })
  })

  describe('list', () => {
    it('returns status and never token fields', async () => {
      const { service, prisma } = createService()
      const now = Date.now()
      const base = {
        organizationId: ORG,
        role: 'MEMBER',
        token: 'legacy-plain-token',
        tokenHash: 'hash',
        createdAt: new Date(now - DAY),
        createdById: ADMIN_ID,
        acceptedAt: null,
        acceptedById: null,
        revokedAt: null,
        expiresAt: new Date(now + DAY),
      }
      prisma.organizationInvite.findMany.mockResolvedValue([
        { ...base, id: '1', email: 'a@example.com' },
        { ...base, id: '2', email: null, acceptedAt: new Date(now) },
        { ...base, id: '3', email: null, revokedAt: new Date(now) },
        { ...base, id: '4', email: null, expiresAt: new Date(now - 1) },
      ])

      const invites = await service.list(ORG)

      expect(invites.map((i: any) => i.status)).toEqual([
        'pending',
        'accepted',
        'revoked',
        'expired',
      ])
      for (const invite of invites) {
        expect(invite).not.toHaveProperty('token')
        expect(invite).not.toHaveProperty('tokenHash')
      }
      expect(JSON.stringify(invites)).not.toContain('legacy-plain-token')
      const where = prisma.organizationInvite.findMany.mock.calls[0][0].where
      expect(where.organizationId).toBe(ORG)
    })
  })

  describe('revoke', () => {
    it('marks an open invite as revoked and audits it', async () => {
      const { service, prisma, audit } = createService()
      prisma.organizationInvite.findFirst.mockResolvedValue({
        id: INVITE_ID,
        organizationId: ORG,
        email: null,
        role: 'MEMBER',
        acceptedAt: null,
        revokedAt: null,
      })
      prisma.organizationInvite.updateMany.mockResolvedValue({ count: 1 })

      await service.revoke(ORG, INVITE_ID, ADMIN_ID)

      const call = prisma.organizationInvite.updateMany.mock.calls[0][0]
      expect(call.where.id).toBe(INVITE_ID)
      expect(call.data.revokedAt).toBeInstanceOf(Date)
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'invite.revoked',
          entityId: INVITE_ID,
          organizationId: ORG,
          userId: ADMIN_ID,
        })
      )
    })

    it('returns 404 for invalid, unknown or foreign invites', async () => {
      const { service, prisma } = createService()
      await expect(service.revoke(ORG, 'bad', ADMIN_ID)).rejects.toBeInstanceOf(
        NotFoundException
      )
      await expect(
        service.revoke(ORG, INVITE_ID, ADMIN_ID)
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(
        prisma.organizationInvite.findFirst.mock.calls[0][0].where
      ).toEqual({ id: INVITE_ID, organizationId: ORG })
    })

    it('rejects revoking an accepted invite (409)', async () => {
      const { service, prisma } = createService()
      prisma.organizationInvite.findFirst.mockResolvedValue({
        id: INVITE_ID,
        organizationId: ORG,
        acceptedAt: new Date(),
        revokedAt: null,
      })
      await expect(
        service.revoke(ORG, INVITE_ID, ADMIN_ID)
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })
})
