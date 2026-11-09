import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { OrganizationsService } from './organizations.service'

const mockOrg = {
  id: 'org-1',
  name: 'Test Org',
  slug: 'test-org',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
}

function createService() {
  const prisma = {
    organization: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    organizationMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    project: {
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    featureFlag: {
      findMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    flagEnvironment: {
      deleteMany: jest.fn(),
    },
    environment: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    brand: {
      deleteMany: jest.fn(),
    },
    auditLog: {
      deleteMany: jest.fn(),
    },
    apiKey: {
      deleteMany: jest.fn(),
    },
  } as any

  const service = new OrganizationsService(prisma)
  return { service, prisma }
}

describe('OrganizationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('findAll', () => {
    it('returns organizations with counts for a user', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([
        { organizationId: 'org-1', organization: mockOrg, role: 'OWNER' },
      ])
      prisma.organizationMember.count.mockResolvedValue(3)
      prisma.project.count.mockResolvedValue(2)

      const result = await service.findAll('user-1')

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test Org')
      expect(result[0].role).toBe('OWNER')
      expect(result[0].memberCount).toBe(3)
      expect(result[0].projectCount).toBe(2)
    })

    it('returns empty array when user has no memberships', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([])

      const result = await service.findAll('user-1')

      expect(result).toHaveLength(0)
    })
  })

  describe('findOne', () => {
    it('returns the organization when found', async () => {
      const { service, prisma } = createService()
      prisma.organization.findUnique.mockResolvedValue(mockOrg)

      const result = await service.findOne('org-1')

      expect(result.id).toBe('org-1')
      expect(result.name).toBe('Test Org')
    })

    it('throws when organization is not found', async () => {
      const { service, prisma } = createService()
      prisma.organization.findUnique.mockResolvedValue(null)

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })
  })

  describe('findByUser', () => {
    it('returns the first organization for a user with counts', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        organization: mockOrg,
        role: 'ADMIN',
      })
      prisma.organizationMember.count.mockResolvedValue(5)
      prisma.project.count.mockResolvedValue(3)

      const result = await service.findByUser('user-1')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Test Org')
      expect(result!.role).toBe('ADMIN')
      expect(result!.memberCount).toBe(5)
    })

    it('returns null when user has no membership', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findFirst.mockResolvedValue(null)

      const result = await service.findByUser('user-1')

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('creates an organization and adds user as OWNER', async () => {
      const { service, prisma } = createService()
      prisma.organization.create.mockResolvedValue(mockOrg)
      prisma.organizationMember.create.mockResolvedValue({})

      const result = await service.create('Test Org', 'test-org', 'user-1')

      expect(result.name).toBe('Test Org')
      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'Test Org', slug: 'test-org' },
      })
      expect(prisma.organizationMember.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          organizationId: 'org-1',
          role: 'OWNER',
        },
      })
    })

    it('generates a UUID slug when none is provided', async () => {
      const { service, prisma } = createService()
      prisma.organization.create.mockResolvedValue(mockOrg)
      prisma.organizationMember.create.mockResolvedValue({})

      await service.create('Test Org', undefined, 'user-1')

      const createCall = prisma.organization.create.mock.calls[0][0]
      expect(createCall.data.slug).toBeDefined()
      expect(createCall.data.slug.length).toBeGreaterThan(0)
    })
  })

  describe('update', () => {
    it('updates the organization', async () => {
      const { service, prisma } = createService()
      prisma.organization.update.mockResolvedValue({
        ...mockOrg,
        name: 'Updated',
      })

      const result = await service.update('org-1', { name: 'Updated' })

      expect(result.name).toBe('Updated')
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { name: 'Updated' },
      })
    })
  })

  describe('delete', () => {
    it('deletes the organization with all dependencies', async () => {
      const { service, prisma } = createService()
      prisma.project.findMany.mockResolvedValue([{ id: 'proj-1' }])
      prisma.featureFlag.findMany.mockResolvedValue([{ id: 'flag-1' }])
      prisma.environment.findMany.mockResolvedValue([{ id: 'env-1' }])
      prisma.flagEnvironment.deleteMany.mockResolvedValue({ count: 1 })
      prisma.featureFlag.deleteMany.mockResolvedValue({ count: 1 })
      prisma.brand.deleteMany.mockResolvedValue({ count: 0 })
      prisma.environment.deleteMany.mockResolvedValue({ count: 1 })
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 0 })
      prisma.project.delete.mockResolvedValue({})
      prisma.apiKey.deleteMany.mockResolvedValue({ count: 0 })
      prisma.organizationMember.deleteMany.mockResolvedValue({ count: 1 })
      prisma.organization.delete.mockResolvedValue({})

      await service.delete('org-1')

      expect(prisma.organization.delete).toHaveBeenCalledWith({
        where: { id: 'org-1' },
      })
      expect(prisma.organizationMember.deleteMany).toHaveBeenCalled()
    })

    it('handles organization with no projects', async () => {
      const { service, prisma } = createService()
      prisma.project.findMany.mockResolvedValue([])
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 0 })
      prisma.apiKey.deleteMany.mockResolvedValue({ count: 0 })
      prisma.environment.deleteMany.mockResolvedValue({ count: 0 })
      prisma.featureFlag.deleteMany.mockResolvedValue({ count: 0 })
      prisma.organizationMember.deleteMany.mockResolvedValue({ count: 0 })
      prisma.organization.delete.mockResolvedValue({})

      await service.delete('org-1')

      expect(prisma.project.delete).not.toHaveBeenCalled()
      expect(prisma.organization.delete).toHaveBeenCalled()
    })
  })

  describe('getMembers', () => {
    it('returns formatted members list', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          user: mockUser,
          role: 'OWNER',
          createdAt: new Date('2024-01-01'),
        },
      ])

      const result = await service.getMembers('org-1')

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('test@example.com')
      expect(result[0].name).toBe('John Doe')
      expect(result[0].role).toBe('OWNER')
    })

    it('uses email as name when first/last name are null', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          user: { ...mockUser, firstName: null, lastName: null },
          role: 'MEMBER',
          createdAt: new Date(),
        },
      ])

      const result = await service.getMembers('org-1')

      expect(result[0].name).toBe('test@example.com')
    })
  })

  describe('addMember', () => {
    it('adds a member with valid role', async () => {
      const { service, prisma } = createService()
      prisma.organization.findUnique.mockResolvedValue(mockOrg)
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.organizationMember.findFirst.mockResolvedValue(null)
      prisma.organizationMember.create.mockResolvedValue({
        user: mockUser,
        role: 'MEMBER',
      })

      const result = await service.addMember(
        'org-1',
        'test@example.com',
        'MEMBER'
      )

      expect(prisma.organizationMember.create).toHaveBeenCalled()
    })

    it('throws when organization not found', async () => {
      const { service, prisma } = createService()
      prisma.organization.findUnique.mockResolvedValue(null)

      await expect(
        service.addMember('org-1', 'test@example.com', 'MEMBER')
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws when user not found', async () => {
      const { service, prisma } = createService()
      prisma.organization.findUnique.mockResolvedValue(mockOrg)
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(
        service.addMember('org-1', 'unknown@example.com', 'MEMBER')
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws when user is already a member', async () => {
      const { service, prisma } = createService()
      prisma.organization.findUnique.mockResolvedValue(mockOrg)
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.organizationMember.findFirst.mockResolvedValue({ id: 'existing' })

      await expect(
        service.addMember('org-1', 'test@example.com', 'MEMBER')
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('throws for invalid role', async () => {
      const { service, prisma } = createService()
      prisma.organization.findUnique.mockResolvedValue(mockOrg)
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.organizationMember.findFirst.mockResolvedValue(null)

      await expect(
        service.addMember('org-1', 'test@example.com', 'SUPERADMIN')
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('removeMember', () => {
    it('removes an existing member', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findFirst.mockResolvedValue({
        id: 'member-1',
      })
      prisma.organizationMember.delete.mockResolvedValue({})

      await service.removeMember('org-1', 'user-1')

      expect(prisma.organizationMember.delete).toHaveBeenCalledWith({
        where: { id: 'member-1' },
      })
    })

    it('throws when member is not found', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findFirst.mockResolvedValue(null)

      await expect(
        service.removeMember('org-1', 'user-1')
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('getStats', () => {
    it('returns stats for a user with organizations', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([
        {
          organization: {
            projects: [{ id: 'proj-1' }, { id: 'proj-2' }],
          },
        },
      ])
      prisma.featureFlag.count.mockResolvedValue(5)

      const result = await service.getStats('user-1')

      expect(result.totalOrganizations).toBe(1)
      expect(result.totalProjects).toBe(2)
      expect(result.totalFlags).toBe(5)
    })

    it('returns zero stats when user has no organizations', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.findMany.mockResolvedValue([])

      const result = await service.getStats('user-1')

      expect(result.totalOrganizations).toBe(0)
      expect(result.totalProjects).toBe(0)
      expect(result.totalFlags).toBe(0)
    })
  })

  describe('create (slug conflict)', () => {
    it('maps a duplicate slug to ConflictException', async () => {
      const { service, prisma } = createService()
      prisma.organization.create.mockRejectedValue({ code: 'P2002' })

      await expect(
        service.create('Test Org', 'taken', 'user-1')
      ).rejects.toBeInstanceOf(ConflictException)
      expect(prisma.organizationMember.create).not.toHaveBeenCalled()
    })
  })

  describe('addMember (VIEWER role)', () => {
    it('accepts the VIEWER role', async () => {
      const { service, prisma } = createService()
      prisma.organization.findUnique.mockResolvedValue(mockOrg)
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.organizationMember.findFirst.mockResolvedValue(null)
      prisma.organizationMember.create.mockResolvedValue({})

      await service.addMember('org-1', 'test@example.com', 'VIEWER')

      expect(prisma.organizationMember.create.mock.calls[0][0].data.role).toBe(
        'VIEWER'
      )
    })
  })

  describe('countOwners', () => {
    it('counts only OWNER memberships of the organization', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.count.mockResolvedValue(2)

      await expect(service.countOwners('org-1')).resolves.toBe(2)
      expect(prisma.organizationMember.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', role: 'OWNER' },
      })
    })
  })

  describe('updateMemberRole', () => {
    it('updates the role and returns a formatted member', async () => {
      const { service, prisma } = createService()
      prisma.organizationMember.update.mockResolvedValue({
        id: 'member-1',
        userId: 'user-1',
        role: 'VIEWER',
        user: mockUser,
      })

      const result = await service.updateMemberRole('member-1', 'VIEWER')

      expect(prisma.organizationMember.update.mock.calls[0][0]).toMatchObject({
        where: { id: 'member-1' },
        data: { role: 'VIEWER' },
      })
      expect(result.name).toBe('John Doe')
      expect(result.role).toBe('VIEWER')
    })

    it('rejects invalid roles', async () => {
      const { service, prisma } = createService()

      await expect(
        service.updateMemberRole('member-1', 'SUPERADMIN')
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.organizationMember.update).not.toHaveBeenCalled()
    })
  })
})
