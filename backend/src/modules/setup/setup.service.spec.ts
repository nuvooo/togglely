import { ConflictException } from '@nestjs/common'
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
function createService(opts: { users?: number; mailEnabled?: boolean } = {}) {
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
        state.locks.push(data)
        return data
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = state.locks.length
        state.locks = state.locks.filter((l) => l.key !== where.key)
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

  const service = new SetupService(prisma, authService, mailService)
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
      })
    })

    it('does not require setup once a user exists', async () => {
      const { service } = createService({ users: 2, mailEnabled: true })
      await expect(service.getStatus()).resolves.toEqual({
        setupRequired: false,
        mailEnabled: true,
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
      expect(state.locks).toEqual([{ key: 'setup' }])
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
