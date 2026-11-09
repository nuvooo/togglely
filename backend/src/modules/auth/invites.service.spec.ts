import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { hashToken } from '../../shared/utils'
import { InvitesService } from './invites.service'

const ORG = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const DAY = 24 * 60 * 60 * 1000
const TOKEN = 'a'.repeat(64)
const PASSWORD = 'Secur3Passw0rd'

type Invite = {
  id: string
  email: string | null
  organizationId: string
  role: string
  tokenHash?: string | null
  token?: string | null
  expiresAt: Date
  createdAt: Date
  acceptedAt?: Date | null
  acceptedById?: string | null
  revokedAt?: Date | null
}

function makeInvite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: 'inv-1',
    email: null,
    organizationId: ORG,
    role: 'MEMBER',
    tokenHash: hashToken(TOKEN),
    token: null,
    expiresAt: new Date(Date.now() + 7 * DAY),
    createdAt: new Date(),
    acceptedAt: null,
    acceptedById: null,
    revokedAt: null,
    ...overrides,
  }
}

function createService(opts: { mailEnabled?: boolean } = {}) {
  const state = {
    invites: [] as Invite[],
    users: [] as any[],
    members: [] as any[],
  }
  const org = { id: ORG, name: 'Acme' }
  const isOpen = (i: Invite) => !i.acceptedAt && !i.revokedAt

  const prisma = {
    organizationInvite: {
      findFirst: jest.fn(async ({ where }: any) => {
        const invite = state.invites.find((i) =>
          'tokenHash' in where
            ? i.tokenHash === where.tokenHash
            : i.token != null && i.token === where.token
        )
        return invite ? { ...invite, organization: org } : null
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const invite = state.invites.find((i) => i.id === where.id)
        return invite ? { ...invite, organization: org } : null
      }),
      findMany: jest.fn(async ({ where }: any) =>
        state.invites
          .filter(
            (i) =>
              i.email === where.email && isOpen(i) && i.expiresAt > new Date()
          )
          .map((i) => ({ ...i, organization: org }))
      ),
      // Supports the atomic claim (open filter) and plain updates by id
      updateMany: jest.fn(async ({ where, data }: any) => {
        const targets = state.invites.filter(
          (i) =>
            i.id === where.id &&
            (!where.AND || isOpen(i)) &&
            (!where.expiresAt || i.expiresAt > where.expiresAt.gt)
        )
        for (const t of targets) Object.assign(t, data)
        return { count: targets.length }
      }),
    },
    user: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          state.users.find((u) =>
            where.id ? u.id === where.id : u.email === where.email
          ) ?? null
      ),
    },
    organizationMember: {
      findFirst: jest.fn(
        async ({ where }: any) =>
          state.members.find(
            (m) =>
              m.organizationId === where.organizationId &&
              m.userId === where.userId
          ) ?? null
      ),
      findMany: jest.fn(async ({ where }: any) =>
        state.members.filter((m) => m.userId === where.userId)
      ),
      create: jest.fn(async ({ data }: any) => {
        state.members.push(data)
        return data
      }),
    },
  } as any

  const authService = {
    register: jest.fn(
      async (
        email: string,
        _password: string,
        name: string,
        firstName: string,
        lastName: string,
        emailVerified: boolean
      ) => {
        if (state.users.some((u) => u.email === email)) {
          throw new ConflictException('Email already exists')
        }
        const user = {
          id: `user-${state.users.length + 1}`,
          email,
          firstName,
          lastName,
          emailVerified,
        }
        state.users.push(user)
        return {
          token: 'register-token',
          emailVerifyToken: emailVerified ? null : 'verify-token',
          user: { id: user.id, email, name, emailVerified },
        }
      }
    ),
    issueToken: jest.fn().mockResolvedValue('session-token'),
  } as any
  const mail = {
    isEnabled: jest.fn().mockReturnValue(opts.mailEnabled ?? false),
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
  } as any
  const audit = { create: jest.fn().mockResolvedValue({}) } as any
  const config = {
    get: jest.fn((key: string) =>
      key === 'FRONTEND_URL' ? 'http://localhost:3000' : undefined
    ),
  } as any

  const service = new InvitesService(prisma, authService, mail, audit, config)
  const addUser = (user: any) => {
    state.users.push(user)
    return user
  }
  return { service, state, prisma, authService, mail, audit, addUser }
}

const registerBody = {
  password: PASSWORD,
  firstName: 'Grace',
  lastName: 'Hopper',
}

describe('InvitesService', () => {
  describe('findValidInvite', () => {
    it('finds an invite by the hash of its token', async () => {
      const { service, state } = createService()
      state.invites.push(makeInvite())
      const invite = await service.findValidInvite(TOKEN)
      expect(invite.id).toBe('inv-1')
    })

    it('falls back to the legacy plain token', async () => {
      const { service, state } = createService()
      // Legacy invites have no tokenHash/revokedAt fields at all
      const legacy: any = makeInvite({ email: 'old@example.com' })
      delete legacy.tokenHash
      delete legacy.revokedAt
      legacy.token = '3f0c6d1e-2a4b-4c5d-9e8f-001122334455'
      state.invites.push(legacy)
      const invite = await service.findValidInvite(legacy.token)
      expect(invite.email).toBe('old@example.com')
    })

    it('returns 404 for unknown tokens', async () => {
      const { service } = createService()
      await expect(service.findValidInvite(TOKEN)).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('returns 404 for revoked and expired invites', async () => {
      const { service, state } = createService()
      state.invites.push(makeInvite({ revokedAt: new Date() }))
      await expect(service.findValidInvite(TOKEN)).rejects.toBeInstanceOf(
        NotFoundException
      )
      state.invites[0] = makeInvite({ expiresAt: new Date(Date.now() - 1) })
      await expect(service.findValidInvite(TOKEN)).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('returns 409 for accepted invites', async () => {
      const { service, state } = createService()
      state.invites.push(makeInvite({ acceptedAt: new Date() }))
      await expect(service.findValidInvite(TOKEN)).rejects.toBeInstanceOf(
        ConflictException
      )
    })
  })

  describe('getInfo', () => {
    it('describes an unbound invite', async () => {
      const { service, state } = createService()
      state.invites.push(makeInvite({ role: 'VIEWER' }))
      await expect(service.getInfo(TOKEN)).resolves.toEqual({
        organizationName: 'Acme',
        role: 'VIEWER',
        email: null,
        existingUser: false,
      })
    })

    it('reports whether the bound email already has an account', async () => {
      const { service, state, addUser } = createService()
      state.invites.push(makeInvite({ email: 'bound@example.com' }))
      await expect(service.getInfo(TOKEN)).resolves.toMatchObject({
        email: 'bound@example.com',
        existingUser: false,
      })
      addUser({ id: 'u1', email: 'bound@example.com' })
      await expect(service.getInfo(TOKEN)).resolves.toMatchObject({
        existingUser: true,
      })
    })
  })

  describe('register', () => {
    it('bound: uses the invite email, verifies it and joins the org', async () => {
      const { service, state, authService, audit } = createService()
      state.invites.push(
        makeInvite({ email: 'bound@example.com', role: 'ADMIN' })
      )

      const result = await service.register(TOKEN, {
        ...registerBody,
        email: 'ignored@example.com',
      })

      expect(authService.register).toHaveBeenCalledWith(
        'bound@example.com',
        PASSWORD,
        'Grace Hopper',
        'Grace',
        'Hopper',
        true
      )
      expect(state.members).toEqual([
        { userId: 'user-1', organizationId: ORG, role: 'ADMIN' },
      ])
      expect(state.invites[0].acceptedAt).toBeInstanceOf(Date)
      expect(state.invites[0].acceptedById).toBe('user-1')
      expect(authService.issueToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', email: 'bound@example.com' })
      )
      expect(result).toEqual({
        token: 'session-token',
        user: expect.objectContaining({
          id: 'user-1',
          email: 'bound@example.com',
        }),
      })
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'invite.accepted',
          entityId: 'inv-1',
          userId: 'user-1',
          organizationId: ORG,
        })
      )
    })

    it('unbound: requires an email (400)', async () => {
      const { service, state, authService } = createService()
      state.invites.push(makeInvite())
      await expect(
        service.register(TOKEN, registerBody)
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(authService.register).not.toHaveBeenCalled()
      expect(state.invites[0].acceptedAt).toBeNull()
    })

    it('unbound: creates an unverified user with the given email', async () => {
      const { service, state, authService, mail } = createService()
      state.invites.push(makeInvite())
      const result = await service.register(TOKEN, {
        ...registerBody,
        email: 'linked@example.com',
      })
      expect(authService.register.mock.calls[0][0]).toBe('linked@example.com')
      expect(authService.register.mock.calls[0][5]).toBe(false)
      expect(state.members).toHaveLength(1)
      expect(result.user.email).toBe('linked@example.com')
      // No SMTP: nothing is sent
      expect(mail.sendVerificationEmail).not.toHaveBeenCalled()
    })

    it('unbound: sends a verification mail when SMTP is enabled', async () => {
      const { service, state, mail } = createService({ mailEnabled: true })
      state.invites.push(makeInvite())
      await service.register(TOKEN, {
        ...registerBody,
        email: 'linked@example.com',
      })
      expect(mail.sendVerificationEmail).toHaveBeenCalledWith(
        'linked@example.com',
        'verify-token',
        'http://localhost:3000'
      )
    })

    it('unbound: rejects an existing email (409) without using the invite', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'taken@example.com' })
      state.invites.push(makeInvite())
      await expect(
        service.register(TOKEN, { ...registerBody, email: 'taken@example.com' })
      ).rejects.toBeInstanceOf(ConflictException)
      expect(state.invites[0].acceptedAt).toBeNull()
      expect(state.members).toHaveLength(0)
    })

    it('releases the invite if creating the user fails', async () => {
      const { service, state, authService } = createService()
      state.invites.push(makeInvite())
      authService.register.mockRejectedValueOnce(new Error('db down'))
      await expect(
        service.register(TOKEN, { ...registerBody, email: 'x@example.com' })
      ).rejects.toThrow('db down')
      expect(state.invites[0].acceptedAt).toBeNull()
    })

    it('cannot use the same link twice (409)', async () => {
      const { service, state } = createService()
      state.invites.push(makeInvite())
      await service.register(TOKEN, { ...registerBody, email: 'a@example.com' })
      await expect(
        service.register(TOKEN, { ...registerBody, email: 'b@example.com' })
      ).rejects.toBeInstanceOf(ConflictException)
      expect(state.users).toHaveLength(1)
    })

    it('lets exactly one of two parallel registrations succeed', async () => {
      const { service, state } = createService()
      state.invites.push(makeInvite())
      const results = await Promise.allSettled([
        service.register(TOKEN, { ...registerBody, email: 'a@example.com' }),
        service.register(TOKEN, { ...registerBody, email: 'b@example.com' }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(state.members).toHaveLength(1)
    })

    it('rejects revoked and expired links (404)', async () => {
      const { service, state } = createService()
      state.invites.push(makeInvite({ revokedAt: new Date() }))
      await expect(
        service.register(TOKEN, { ...registerBody, email: 'a@example.com' })
      ).rejects.toBeInstanceOf(NotFoundException)
      state.invites[0] = makeInvite({ expiresAt: new Date(Date.now() - 1) })
      await expect(
        service.register(TOKEN, { ...registerBody, email: 'a@example.com' })
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(state.users).toHaveLength(0)
    })
  })

  describe('accept', () => {
    const verified = (email: string) => ({
      id: 'u-verified',
      email,
      emailVerified: true,
    })

    it('bound: lets the verified owner of the email join', async () => {
      const { service, state, addUser, audit } = createService()
      addUser(verified('bound@example.com'))
      state.invites.push(
        makeInvite({ email: 'bound@example.com', role: 'VIEWER' })
      )
      const result = await service.accept(TOKEN, 'u-verified')
      expect(result).toMatchObject({ success: true, organizationId: ORG })
      expect(state.members).toEqual([
        { userId: 'u-verified', organizationId: ORG, role: 'VIEWER' },
      ])
      expect(state.invites[0].acceptedById).toBe('u-verified')
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invite.accepted' })
      )
    })

    it('bound: rejects an unverified account with the right email (403)', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'bound@example.com', emailVerified: false })
      state.invites.push(makeInvite({ email: 'bound@example.com' }))
      await expect(service.accept(TOKEN, 'u1')).rejects.toBeInstanceOf(
        ForbiddenException
      )
      expect(state.members).toHaveLength(0)
      expect(state.invites[0].acceptedAt).toBeNull()
    })

    it('bound: rejects a different email (403)', async () => {
      const { service, state, addUser } = createService()
      addUser(verified('other@example.com'))
      state.invites.push(makeInvite({ email: 'bound@example.com' }))
      await expect(service.accept(TOKEN, 'u-verified')).rejects.toBeInstanceOf(
        ForbiddenException
      )
    })

    it('unbound: any logged-in user may join', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'anyone@example.com', emailVerified: false })
      state.invites.push(makeInvite())
      await service.accept(TOKEN, 'u1')
      expect(state.members).toHaveLength(1)
    })

    it('rejects existing members (409) without using the invite', async () => {
      const { service, state, addUser } = createService()
      addUser(verified('m@example.com'))
      state.members.push({
        userId: 'u-verified',
        organizationId: ORG,
        role: 'MEMBER',
      })
      state.invites.push(makeInvite())
      await expect(service.accept(TOKEN, 'u-verified')).rejects.toBeInstanceOf(
        ConflictException
      )
      expect(state.invites[0].acceptedAt).toBeNull()
    })

    it('rejects revoked (404), expired (404) and used (409) invites', async () => {
      const { service, state, addUser } = createService()
      addUser(verified('m@example.com'))
      state.invites.push(makeInvite({ revokedAt: new Date() }))
      await expect(service.accept(TOKEN, 'u-verified')).rejects.toBeInstanceOf(
        NotFoundException
      )
      state.invites[0] = makeInvite({ expiresAt: new Date(Date.now() - 1) })
      await expect(service.accept(TOKEN, 'u-verified')).rejects.toBeInstanceOf(
        NotFoundException
      )
      state.invites[0] = makeInvite({ acceptedAt: new Date() })
      await expect(service.accept(TOKEN, 'u-verified')).rejects.toBeInstanceOf(
        ConflictException
      )
      expect(state.members).toHaveLength(0)
    })

    it('accepts legacy invites', async () => {
      const { service, state, addUser } = createService()
      addUser(verified('old@example.com'))
      const legacy: any = makeInvite({ email: 'old@example.com' })
      delete legacy.tokenHash
      delete legacy.revokedAt
      legacy.token = 'legacy-uuid'
      state.invites.push(legacy)
      await service.accept('legacy-uuid', 'u-verified')
      expect(state.members).toHaveLength(1)
    })

    it('lets exactly one of two parallel accepts succeed', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'a@example.com', emailVerified: true })
      addUser({ id: 'u2', email: 'b@example.com', emailVerified: true })
      state.invites.push(makeInvite())
      const results = await Promise.allSettled([
        service.accept(TOKEN, 'u1'),
        service.accept(TOKEN, 'u2'),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(state.members).toHaveLength(1)
    })
  })

  describe('pending invites', () => {
    it('lists only bound invites of verified users, without tokens', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'me@example.com', emailVerified: true })
      state.invites.push(makeInvite({ email: 'me@example.com' }))
      const result = await service.getPendingForUser('u1')
      expect(result.invites).toHaveLength(1)
      expect(result.invites[0]).toMatchObject({
        id: 'inv-1',
        organizationName: 'Acme',
      })
      expect(JSON.stringify(result)).not.toContain(hashToken(TOKEN))
    })

    it('hides invites from unverified users', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'me@example.com', emailVerified: false })
      state.invites.push(makeInvite({ email: 'me@example.com' }))
      await expect(service.getPendingForUser('u1')).resolves.toEqual({
        invites: [],
        emailVerificationRequired: true,
      })
    })

    it('accepts a pending invite by id for the verified invitee', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'me@example.com', emailVerified: true })
      state.invites.push(
        makeInvite({ id: 'aaaaaaaaaaaaaaaaaaaaaaab', email: 'me@example.com' })
      )
      await service.acceptPending('aaaaaaaaaaaaaaaaaaaaaaab', 'u1')
      expect(state.members).toHaveLength(1)
    })

    it('does not reveal or accept invites addressed to someone else (404)', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'me@example.com', emailVerified: true })
      state.invites.push(
        makeInvite({
          id: 'aaaaaaaaaaaaaaaaaaaaaaab',
          email: 'other@example.com',
        })
      )
      state.invites.push(
        makeInvite({ id: 'aaaaaaaaaaaaaaaaaaaaaaac', tokenHash: 'x' })
      )
      await expect(
        service.acceptPending('aaaaaaaaaaaaaaaaaaaaaaab', 'u1')
      ).rejects.toBeInstanceOf(NotFoundException)
      // Unbound invites cannot be accepted by id (the link is the proof)
      await expect(
        service.acceptPending('aaaaaaaaaaaaaaaaaaaaaaac', 'u1')
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(service.acceptPending('bad', 'u1')).rejects.toBeInstanceOf(
        NotFoundException
      )
      expect(state.members).toHaveLength(0)
    })
  })
})
