import { UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { AuthService } from './auth.service'

jest.mock('bcryptjs')

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  password: 'hashed-password',
  firstName: 'John',
  lastName: 'Doe',
  emailVerified: false,
  emailVerifyToken: null,
}

function createService(overrides: Record<string, any> = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    organizationMember: {
      findFirst: jest.fn(),
    },
    ...overrides,
  } as any

  const config = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'test-jwt-secret'
      if (key === 'JWT_EXPIRY') return '7d'
      return undefined
    }),
  } as any

  const service = new AuthService(prisma, config)
  return { service, prisma, config }
}

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('login', () => {
    it('returns a token for valid credentials', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.organizationMember.findFirst.mockResolvedValue({
        organizationId: 'org-1',
      })
      mockBcrypt.compare.mockResolvedValue(true as never)

      const result = await service.login('test@example.com', 'password123')

      expect(result.token).toBeDefined()
      expect(result.user.id).toBe('user-1')
      expect(result.user.email).toBe('test@example.com')
    })

    it('throws when email is not found', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(
        service.login('unknown@example.com', 'password123')
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('throws when password is invalid', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockResolvedValue(false as never)

      await expect(
        service.login('test@example.com', 'wrong-password')
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })
  })

  describe('register', () => {
    it('creates a user and returns a token', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue(null)
      mockBcrypt.hash.mockResolvedValue('hashed' as never)
      prisma.user.create.mockResolvedValue({
        id: 'user-2',
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        emailVerified: false,
        emailVerifyToken: 'some-token',
      })

      const result = await service.register(
        'new@example.com',
        'password123',
        'Jane Doe'
      )

      expect(result.token).toBeDefined()
      expect(result.user.email).toBe('new@example.com')
      expect(prisma.user.create).toHaveBeenCalledTimes(1)
    })

    it('throws when email already exists', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue(mockUser)

      await expect(
        service.register('test@example.com', 'password123', 'John Doe')
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })
  })
})
