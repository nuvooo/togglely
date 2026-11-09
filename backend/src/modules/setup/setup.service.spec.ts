import { ConflictException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { BCRYPT_ROUNDS } from '../../shared/utils'
import { SetupService } from './setup.service'

jest.mock('bcryptjs')
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

const DTO = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'Secur3Passw0rd',
  organizationName: 'Analytical Engines',
}

function uniqueError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: 'test',
  })
}

/** In-memory fake of the Prisma calls the setup flow uses. */
function createService(
  opts: { users?: number; mailEnabled?: boolean; setupToken?: string } = {}
) {
  const state = {
    users: [] as any[],
    orgs: [] as any[],
    members: [] as any[],
    locks: [] as any[],
  }
  for (let i = 0; i < (opts.users ?? 0); i++) {
    state.users.push({ id: `existing-${i}`, email: `u${i}@example.com` })
  }

  const prisma: any = {
    user: {
      count: jest.fn(async () => state.users.length),
      create: jest.fn(async ({ data }: any) => {
        const user = { id: `user-${state.users.length + 1}`, ...data }
        state.users.push(user)
        return user
      }),
    },
    organization: {
      create: jest.fn(async ({ data }: any) => {
        const org = { id: `org-${state.orgs.length + 1}`, ...data }
        state.orgs.push(org)
        return org
      }),
    },
    organizationMember: {
      create: jest.fn(async ({ data }: any) => {
        state.members.push(data)
        return data
      }),
    },
    instanceLock: {
      create: jest.fn(async ({ data }: any) => {
        if (state.locks.some((l) => l.key === data.key)) throw uniqueError()
        const lock = { createdAt: new Date(), ...data }
        state.locks.push(lock)
        return lock
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = state.locks.length
        state.locks = state.locks.filter(
          (l) =>
            l.key !== where.key ||
            (where.createdAt?.lt && !(l.createdAt < where.createdAt.lt))
        )
        return { count: before - state.locks.length }
      }),
    },
  }
  // Rolls back users/orgs/members on error like a real transaction
  prisma.$transaction = jest.fn(async (fn: any) => {
    const snapshot = {
      users: [...state.users],
      orgs: [...state.orgs],
      members: [...state.members],
    }
    try {
      return await fn(prisma)
    } catch (error) {
      Object.assign(state, snapshot)
      throw error
    }
  })

  const authService = {
    issueToken: jest.fn().mockResolvedValue('jwt-token'),
  } as any
  const mailService = {
    isEnabled: jest.fn().mockReturnValue(opts.mailEnabled ?? false),
  } as any

  const config = {
    get: jest.fn((key: string) =>
      key === 'SETUP_TOKEN' ? opts.setupToken : undefined
    ),
  } as any

  const service = new SetupService(prisma, authService, mailService, config)
  return { service, prisma, state, authService, mailService }
}

describe('SetupService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBcrypt.hash.mockResolvedValue('hashed' as never)
  })

  describe('getStatus', () => {
    it('requires setup when no user exists', async () => {
      const { service } = createService({ users: 0, mailEnabled: false })
      await expect(service.getStatus()).resolves.toEqual({
        setupRequired: true,
        mailEnabled: false,
        setupTokenRequired: false,
      })
    })

    it('does not require setup once a user exists', async () => {
      const { service } = createService({ users: 2, mailEnabled: true })
      await expect(service.getStatus()).resolves.toEqual({
        setupRequired: false,
        mailEnabled: true,
        setupTokenRequired: false,
      })
    })

    it('reports whether a setup token is required', async () => {
      const { service } = createService({ setupToken: 's3cret' })
      await expect(service.getStatus()).resolves.toMatchObject({
        setupTokenRequired: true,
      })
    })
  })

  describe('setup', () => {
    it('creates a verified owner, the organization and the membership', async () => {
      const { service, state, authService } = createService()

      const result = await service.setup(DTO)

      expect(mockBcrypt.hash).toHaveBeenCalledWith(DTO.password, BCRYPT_ROUNDS)
      expect(state.users).toHaveLength(1)
      expect(state.users[0]).toMatchObject({
        email: DTO.email,
        password: 'hashed',
        firstName: 'Ada',
        lastName: 'Lovelace',
        emailVerified: true,
      })
      expect(state.orgs).toHaveLength(1)
      expect(state.orgs[0].name).toBe(DTO.organizationName)
      expect(state.orgs[0].slug).toEqual(expect.any(String))
      expect(state.members).toEqual([
        { userId: 'user-1', organizationId: 'org-1', role: 'OWNER' },
      ])
      expect(state.locks).toEqual([
        { key: 'setup', createdAt: expect.any(Date) },
      ])
      expect(authService.issueToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', email: DTO.email })
      )
      expect(result).toEqual({
        token: 'jwt-token',
        user: { id: 'user-1', email: DTO.email, name: 'Ada Lovelace' },
      })
    })

    it('never returns the password hash', async () => {
      const { service } = createService()
      const result = await service.setup(DTO)
      expect(JSON.stringify(result)).not.toContain('hashed')
    })

    it('rejects a second setup with 409', async () => {
      const { service, state } = createService()
      await service.setup(DTO)
      await expect(
        service.setup({ ...DTO, email: 'eve@example.com' })
      ).rejects.toBeInstanceOf(ConflictException)
      expect(state.users).toHaveLength(1)
    })

    it('rejects setup on an instance with existing users', async () => {
      const { service, prisma } = createService({ users: 1 })
      await expect(service.setup(DTO)).rejects.toBeInstanceOf(ConflictException)
      expect(prisma.instanceLock.create).not.toHaveBeenCalled()
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('maps a lock collision to 409 without creating anything', async () => {
      const { service, prisma, state } = createService()
      state.locks.push({ key: 'setup' })
      await expect(service.setup(DTO)).rejects.toBeInstanceOf(ConflictException)
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('removes a stale lock (older than 5 minutes) and sets up', async () => {
      const { service, prisma, state } = createService()
      // A crashed earlier attempt left its lock behind
      state.locks.push({
        key: 'setup',
        createdAt: new Date(Date.now() - 6 * 60 * 1000),
      })
      await expect(service.setup(DTO)).resolves.toMatchObject({
        token: 'jwt-token',
      })
      expect(prisma.instanceLock.deleteMany).toHaveBeenCalledWith({
        where: { key: 'setup', createdAt: { lt: expect.any(Date) } },
      })
      expect(state.users).toHaveLength(1)
    })

    it('keeps a fresh lock of a running setup (409)', async () => {
      const { service, prisma, state } = createService()
      state.locks.push({
        key: 'setup',
        createdAt: new Date(Date.now() - 60 * 1000),
      })
      await expect(service.setup(DTO)).rejects.toBeInstanceOf(ConflictException)
      expect(state.locks).toHaveLength(1)
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('runs the setup transaction with an explicit timeout', async () => {
      const { service, prisma } = createService()
      await service.setup(DTO)
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 10_000,
      })
    })

    describe('with SETUP_TOKEN', () => {
      it('sets up with the matching token', async () => {
        const { service, state } = createService({ setupToken: 's3cret' })
        await expect(
          service.setup({ ...DTO, setupToken: 's3cret' })
        ).resolves.toMatchObject({ token: 'jwt-token' })
        expect(state.users).toHaveLength(1)
      })

      it.each([
        ['missing', undefined],
        ['wrong', 'wrong'],
        ['longer', 's3cret-and-more'],
      ])('rejects a %s token with 403', async (_label, setupToken) => {
        const { service, prisma } = createService({ setupToken: 's3cret' })
        await expect(
          service.setup({ ...DTO, setupToken })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(prisma.instanceLock.create).not.toHaveBeenCalled()
        expect(prisma.user.create).not.toHaveBeenCalled()
      })
    })

    it('ignores a setupToken when SETUP_TOKEN is not configured', async () => {
      const { service } = createService()
      await expect(
        service.setup({ ...DTO, setupToken: 'anything' })
      ).resolves.toMatchObject({ token: 'jwt-token' })
    })

    it('lets exactly one of two parallel calls succeed', async () => {
      const { service, state } = createService()
      const results = await Promise.allSettled([
        service.setup(DTO),
        service.setup({ ...DTO, email: 'eve@example.com' }),
      ])
      const ok = results.filter((r) => r.status === 'fulfilled')
      const failed = results.filter((r) => r.status === 'rejected') as any[]
      expect(ok).toHaveLength(1)
      expect(failed).toHaveLength(1)
      expect(failed[0].reason).toBeInstanceOf(ConflictException)
      expect(state.users).toHaveLength(1)
    })

    it('re-checks the user count inside the transaction', async () => {
      const { service, prisma } = createService()
      // Outside the transaction no user exists, inside one appeared
      prisma.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
      await expect(service.setup(DTO)).rejects.toBeInstanceOf(ConflictException)
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('releases the lock when the setup transaction fails', async () => {
      const { service, prisma, state } = createService()
      prisma.organization.create.mockRejectedValueOnce(new Error('db down'))
      await expect(service.setup(DTO)).rejects.toThrow('db down')
      expect(state.locks).toEqual([])

      // A retry can succeed afterwards
      await expect(service.setup(DTO)).resolves.toMatchObject({
        token: 'jwt-token',
      })
    })
  })
})
