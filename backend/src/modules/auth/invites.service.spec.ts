import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AsyncLocalStorage } from 'async_hooks'
import * as bcrypt from 'bcryptjs'
import { BCRYPT_ROUNDS, hashToken } from '../../shared/utils'
import { InvitesService } from './invites.service'

jest.mock('bcryptjs')
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

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

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(code, {
    code,
    clientVersion: 'test',
  })
}

function createService(opts: { mailEnabled?: boolean } = {}) {
  const state = {
    invites: [] as Invite[],
    users: [] as any[],
    members: [] as any[],
  }
  const org = { id: ORG, name: 'Acme' }
  const isOpen = (i: Invite) => !i.acceptedAt && !i.revokedAt

  // Writes inside $transaction register an undo step, so a failing
  // transaction rolls back only its own writes (also when run in parallel).
  const tx = new AsyncLocalStorage<Array<() => void>>()
  const onRollback = (undo: () => void) => tx.getStore()?.push(undo)
  const remove = (list: any[], item: any) => () => {
    const index = list.indexOf(item)
    if (index >= 0) list.splice(index, 1)
  }
  const assign = (target: any, data: any) => {
    const previous = Object.fromEntries(
      Object.keys(data).map((key) => [key, target[key]])
    )
    Object.assign(target, data)
    onRollback(() => Object.assign(target, previous))
  }
  const emailMatches = (actual: string, filter: any) =>
    typeof filter === 'string'
      ? actual === filter
      : filter.mode === 'insensitive'
        ? actual?.toLowerCase() === filter.equals.toLowerCase()
        : actual === filter.equals

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
              i.email != null &&
              emailMatches(i.email, where.email) &&
              isOpen(i) &&
              i.expiresAt > new Date()
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
        for (const t of targets) assign(t, data)
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
      findFirst: jest.fn(
        async ({ where }: any) =>
          state.users.find((u) => emailMatches(u.email, where.email)) ?? null
      ),
      create: jest.fn(async ({ data }: any) => {
        if (state.users.some((u) => u.email === data.email)) {
          throw prismaError('P2002')
        }
        const user = { id: `user-${state.users.length + 1}`, ...data }
        state.users.push(user)
        onRollback(remove(state.users, user))
        return { ...user }
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const user = state.users.find((u) => u.id === where.id)
        if (!user) throw prismaError('P2025')
        assign(user, data)
        return { ...user }
      }),
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
      count: jest.fn(
        async ({ where }: any) =>
          state.members.filter((m) => m.userId === where.userId).length
      ),
      create: jest.fn(async ({ data }: any) => {
        if (
          state.members.some(
            (m) =>
              m.userId === data.userId &&
              m.organizationId === data.organizationId
          )
        ) {
          throw prismaError('P2002')
        }
        state.members.push(data)
        onRollback(remove(state.members, data))
        return data
      }),
    },
    $transaction: jest.fn(async (fn: any) => {
      const undo: Array<() => void> = []
      return tx.run(undo, async () => {
        try {
          return await fn(prisma)
        } catch (error) {
          for (const step of undo.reverse()) step()
          throw error
        }
      })
    }),
  } as any

  const authService = {
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
  beforeEach(() => {
    jest.clearAllMocks()
    mockBcrypt.hash.mockResolvedValue('hashed' as never)
  })

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
      addUser({ id: 'u1', email: 'Bound@Example.com', emailVerified: true })
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

      expect(mockBcrypt.hash).toHaveBeenCalledWith(PASSWORD, BCRYPT_ROUNDS)
      expect(state.users).toEqual([
        expect.objectContaining({
          id: 'user-1',
          email: 'bound@example.com',
          password: 'hashed',
          firstName: 'Grace',
          lastName: 'Hopper',
          emailVerified: true,
          emailVerifyToken: null,
        }),
      ])
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
        user: {
          id: 'user-1',
          email: 'bound@example.com',
          name: 'Grace Hopper',
          emailVerified: true,
        },
        // the client opens the joined organization without guessing
        organizationId: ORG,
      })
      expect(JSON.stringify(result)).not.toContain('hashed')
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
      const { service, state, prisma } = createService()
      state.invites.push(makeInvite())
      await expect(
        service.register(TOKEN, registerBody)
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.user.create).not.toHaveBeenCalled()
      expect(state.invites[0].acceptedAt).toBeNull()
    })

    it('unbound: creates an unverified user with the given email', async () => {
      const { service, state, mail } = createService()
      state.invites.push(makeInvite())
      const result = await service.register(TOKEN, {
        ...registerBody,
        email: 'linked@example.com',
      })
      expect(state.users[0]).toMatchObject({
        email: 'linked@example.com',
        emailVerified: false,
        emailVerifyToken: expect.any(String),
      })
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
        expect.stringMatching(/^[a-f0-9]{64}$/),
        'http://localhost:3000'
      )
      // Only the hash of the mailed token is stored
      const mailed = mail.sendVerificationEmail.mock.calls[0][1]
      expect(state.users[0].emailVerifyToken).toBe(hashToken(mailed))
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

    it('unbound: rejects a legacy mixed-case account with the same email (409)', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'Taken@Example.com', emailVerified: true })
      state.invites.push(makeInvite())
      await expect(
        service.register(TOKEN, { ...registerBody, email: 'taken@example.com' })
      ).rejects.toBeInstanceOf(ConflictException)
      expect(state.users).toHaveLength(1)
      expect(state.invites[0].acceptedAt).toBeNull()
    })

    it('normalizes the email of open-link registrations', async () => {
      const { service, state } = createService()
      state.invites.push(makeInvite())
      const result = await service.register(TOKEN, {
        ...registerBody,
        email: '  Linked@Example.COM ',
      })
      expect(state.users[0].email).toBe('linked@example.com')
      expect(result.user.email).toBe('linked@example.com')
    })

    it('releases the invite if creating the user fails', async () => {
      const { service, state, prisma } = createService()
      state.invites.push(makeInvite())
      prisma.user.create.mockRejectedValueOnce(new Error('db down'))
      await expect(
        service.register(TOKEN, { ...registerBody, email: 'x@example.com' })
      ).rejects.toThrow('db down')
      expect(state.invites[0].acceptedAt).toBeNull()
    })

    it('leaves neither a user nor a used invite if joining fails', async () => {
      const { service, state, prisma } = createService()
      state.invites.push(makeInvite())
      prisma.organizationMember.create.mockRejectedValueOnce(
        new Error('db down')
      )
      await expect(
        service.register(TOKEN, { ...registerBody, email: 'x@example.com' })
      ).rejects.toThrow('db down')
      expect(state.users).toHaveLength(0)
      expect(state.members).toHaveLength(0)
      expect(state.invites[0].acceptedAt).toBeNull()
      expect(state.invites[0].acceptedById).toBeNull()

      // The link still works afterwards
      await service.register(TOKEN, { ...registerBody, email: 'x@example.com' })
      expect(state.members).toHaveLength(1)
    })

    it('runs user, claim and membership in one transaction', async () => {
      const { service, state, prisma } = createService()
      state.invites.push(makeInvite())
      await service.register(TOKEN, { ...registerBody, email: 'x@example.com' })
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 10_000,
      })
    })

    it('maps a parallel registration of the same email to 409', async () => {
      const { service, state, prisma } = createService()
      state.invites.push(makeInvite())
      prisma.user.create.mockRejectedValueOnce(prismaError('P2002'))
      await expect(
        service.register(TOKEN, { ...registerBody, email: 'x@example.com' })
      ).rejects.toBeInstanceOf(ConflictException)
      expect(state.invites[0].acceptedAt).toBeNull()
    })

    describe('bound invite for an email squatted by an unverified account', () => {
      const squatter = () => ({
        id: 'squat',
        email: 'bound@example.com',
        password: 'attacker-hash',
        firstName: 'Mal',
        lastName: 'Lory',
        emailVerified: false,
        emailVerifyToken: 'pending',
        resetToken: 'attacker-reset',
      })

      it('takes over the account in place: new password, name, verified', async () => {
        const { service, state, addUser } = createService()
        addUser(squatter())
        state.invites.push(makeInvite({ email: 'bound@example.com' }))

        const result = await service.register(TOKEN, registerBody)

        expect(state.users).toHaveLength(1)
        expect(state.users[0]).toMatchObject({
          id: 'squat',
          email: 'bound@example.com',
          password: 'hashed',
          firstName: 'Grace',
          lastName: 'Hopper',
          emailVerified: true,
          emailVerifyToken: null,
          resetToken: null,
          passwordChangedAt: expect.any(Date),
        })
        expect(state.members).toEqual([
          { userId: 'squat', organizationId: ORG, role: 'MEMBER' },
        ])
        expect(state.invites[0].acceptedById).toBe('squat')
        expect(result.user).toMatchObject({ id: 'squat', emailVerified: true })
      })

      it('reports the address as free in the invite info', async () => {
        const { service, state, addUser } = createService()
        addUser(squatter())
        state.invites.push(makeInvite({ email: 'bound@example.com' }))
        await expect(service.getInfo(TOKEN)).resolves.toMatchObject({
          existingUser: false,
        })
      })

      it('keeps verified accounts (409)', async () => {
        const { service, state, addUser } = createService()
        addUser({ ...squatter(), emailVerified: true })
        state.invites.push(makeInvite({ email: 'bound@example.com' }))
        await expect(
          service.register(TOKEN, registerBody)
        ).rejects.toBeInstanceOf(ConflictException)
        expect(state.users[0].password).toBe('attacker-hash')
        expect(state.invites[0].acceptedAt).toBeNull()
      })

      it('keeps unverified accounts that belong to an organization (409)', async () => {
        const { service, state, addUser } = createService()
        addUser(squatter())
        state.members.push({
          userId: 'squat',
          organizationId: 'other-org',
          role: 'MEMBER',
        })
        state.invites.push(makeInvite({ email: 'bound@example.com' }))
        await expect(
          service.register(TOKEN, registerBody)
        ).rejects.toBeInstanceOf(ConflictException)
        expect(state.users[0].password).toBe('attacker-hash')
      })

      it('does not take over accounts via open links (409)', async () => {
        const { service, state, addUser } = createService()
        addUser(squatter())
        state.invites.push(makeInvite())
        await expect(
          service.register(TOKEN, {
            ...registerBody,
            email: 'bound@example.com',
          })
        ).rejects.toBeInstanceOf(ConflictException)
        expect(state.users[0].password).toBe('attacker-hash')
      })
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

    it('keeps the invite valid when the membership already exists (409)', async () => {
      const { service, state, addUser, prisma } = createService()
      addUser(verified('m@example.com'))
      state.invites.push(makeInvite())
      // Joined in parallel after the pre-check: the unique index fires
      prisma.organizationMember.findFirst.mockResolvedValueOnce(null)
      state.members.push({
        userId: 'u-verified',
        organizationId: ORG,
        role: 'MEMBER',
      })
      const error = await service.accept(TOKEN, 'u-verified').catch((e) => e)
      expect(error).toBeInstanceOf(ConflictException)
      expect(error.message).toMatch(/already a member/)
      expect(state.invites[0].acceptedAt).toBeNull()
      expect(state.invites[0].acceptedById).toBeNull()
      expect(state.members).toHaveLength(1)
    })

    it('releases the invite when joining fails', async () => {
      const { service, state, addUser, prisma } = createService()
      addUser(verified('m@example.com'))
      state.invites.push(makeInvite())
      prisma.organizationMember.create.mockRejectedValueOnce(
        new Error('db down')
      )
      await expect(service.accept(TOKEN, 'u-verified')).rejects.toThrow(
        'db down'
      )
      expect(state.invites[0].acceptedAt).toBeNull()
      await service.accept(TOKEN, 'u-verified')
      expect(state.members).toHaveLength(1)
    })

    it('maps a transaction write conflict to 409', async () => {
      const { service, state, addUser, prisma } = createService()
      addUser(verified('m@example.com'))
      state.invites.push(makeInvite())
      prisma.organizationInvite.updateMany.mockRejectedValueOnce(
        prismaError('P2034')
      )
      await expect(service.accept(TOKEN, 'u-verified')).rejects.toBeInstanceOf(
        ConflictException
      )
    })

    it('bound: matches the invite email case-insensitively', async () => {
      const { service, state, addUser } = createService()
      addUser(verified('Bound@Example.com'))
      state.invites.push(makeInvite({ email: 'bound@example.com' }))
      await service.accept(TOKEN, 'u-verified')
      expect(state.members).toHaveLength(1)
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

    it('lists invites of legacy mixed-case accounts', async () => {
      const { service, state, addUser } = createService()
      addUser({ id: 'u1', email: 'Me@Example.com', emailVerified: true })
      state.invites.push(makeInvite({ email: 'me@example.com' }))
      const result = await service.getPendingForUser('u1')
      expect(result.invites).toHaveLength(1)
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
