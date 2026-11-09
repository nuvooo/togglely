import { BadRequestException } from '@nestjs/common'
import { ApiKeysService, hashApiKey, maskApiKey } from './api-keys.service'

const FULL_KEY = `tk_${'a'.repeat(60)}beef`

describe('ApiKeysService', () => {
  it('rejects unsupported api key types', async () => {
    const prisma = {
      apiKey: {
        create: jest.fn(),
      },
    } as any

    const service = new ApiKeysService(prisma)

    await expect(
      service.create('org-1', 'user-1', {
        name: 'Invalid key',
        type: 'ROOT',
      })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('masks keys', () => {
    expect(maskApiKey(FULL_KEY)).toBe('tk_aaaa…beef')
    expect(maskApiKey('short')).toBe('…')
  })

  describe('findByUser', () => {
    function setup() {
      const prisma = {
        organizationMember: {
          findMany: jest.fn().mockResolvedValue([
            { organizationId: 'org-admin', role: 'ADMIN' },
            { organizationId: 'org-viewer', role: 'VIEWER' },
          ]),
        },
        apiKey: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'k1', key: FULL_KEY, organizationId: 'org-admin' },
            { id: 'k2', key: FULL_KEY, organizationId: 'org-viewer' },
          ]),
        },
      } as any
      return { prisma, service: new ApiKeysService(prisma) }
    }

    it('only queries keys of the user organizations', async () => {
      const { prisma, service } = setup()
      await service.findByUser('user-1')
      expect(prisma.apiKey.findMany.mock.calls[0][0].where).toEqual({
        organizationId: { in: ['org-admin', 'org-viewer'] },
      })
    })

    it('reveals full keys only to ADMIN/OWNER', async () => {
      const { service } = setup()
      const keys = await service.findByUser('user-1')
      expect(keys.find((k) => k.id === 'k1')!.key).toBe(FULL_KEY)
      expect(keys.find((k) => k.id === 'k2')!.key).toBe('tk_aaaa…beef')
    })

    it('returns [] without memberships', async () => {
      const { prisma, service } = setup()
      prisma.organizationMember.findMany.mockResolvedValue([])
      await expect(service.findByUser('user-1')).resolves.toEqual([])
      expect(prisma.apiKey.findMany).not.toHaveBeenCalled()
    })
  })

  it('findByOrganization masks keys for MEMBERs', async () => {
    const prisma = {
      apiKey: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'k1', key: FULL_KEY, organizationId: 'o' },
          ]),
      },
    } as any
    const service = new ApiKeysService(prisma)
    const keys = await service.findByOrganization('o', 'MEMBER')
    expect(keys[0].key).toBe('tk_aaaa…beef')
    expect(prisma.apiKey.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'o',
    })
  })

  it('findByOrganization below ADMIN hides other users MCP keys, keeps own MCP keys and other types masked', async () => {
    const prisma = {
      apiKey: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'own', type: 'MCP', userId: 'me', key: FULL_KEY },
          { id: 'other', type: 'MCP', userId: 'x', key: FULL_KEY },
          { id: 'srv', type: 'SERVER', userId: 'x', key: FULL_KEY },
        ]),
      },
    } as any
    const service = new ApiKeysService(prisma)
    const keys = await service.findByOrganization('o', 'MEMBER', 'me')
    expect(keys.map((k) => k.id)).toEqual(['own', 'srv'])
    expect(keys[1].key).toBe('tk_aaaa…beef')
    const admin = await service.findByOrganization('o', 'ADMIN', 'me')
    expect(admin).toHaveLength(3)
  })

  describe('create MCP', () => {
    const PROJECT = '64a000000000000000000020'
    const ENV = '64a000000000000000000030'

    it('create MCP key stores only hash and masked key, returns plain key once', async () => {
      const prisma = {
        apiKey: {
          create: jest.fn().mockImplementation(async ({ data }) => ({
            id: 'k',
            ...data,
          })),
        },
      } as any
      const result = await new ApiKeysService(prisma).create('org', 'u', {
        name: 'Claude',
        type: 'MCP',
        projectId: PROJECT,
        allowedEnvironmentIds: [ENV],
      })
      expect(result.key).toMatch(/^tkm_[a-f0-9]{64}$/)
      const data = prisma.apiKey.create.mock.calls[0][0].data
      expect(data.key).toContain('…')
      expect(data.key).not.toBe(result.key)
      expect(data.keyHash).toBe(hashApiKey(result.key))
      expect(data.projectId).toBe(PROJECT)
      expect(data.allowedEnvironmentIds).toEqual([ENV])
    })

    it('create MCP key without projectId throws BadRequestException', async () => {
      const prisma = { apiKey: { create: jest.fn() } } as any
      await expect(
        new ApiKeysService(prisma).create('org', 'u', {
          name: 'x',
          type: 'MCP',
        })
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.apiKey.create).not.toHaveBeenCalled()
    })

    it('non-MCP keys ignore projectId and store no hash', async () => {
      const prisma = {
        apiKey: { create: jest.fn().mockResolvedValue({}) },
      } as any
      await new ApiKeysService(prisma).create('org', 'u', {
        name: 'x',
        type: 'SERVER',
        projectId: PROJECT,
      })
      const data = prisma.apiKey.create.mock.calls[0][0].data
      expect(data.projectId).toBeUndefined()
      expect(data.keyHash).toBeUndefined()
      expect(data.key).toMatch(/^tk_/)
    })
  })

  it('lists the environment binding and the creator user id for visibility checks', async () => {
    const prisma = {
      apiKey: { findMany: jest.fn().mockResolvedValue([]) },
    } as any
    await new ApiKeysService(prisma).findByOrganization('o', 'ADMIN')
    const select = prisma.apiKey.findMany.mock.calls[0][0].select
    expect(select.environmentId).toBe(true)
    expect(select.userId).toBe(true)
    expect(select.projectId).toBe(true)
    expect(select.allowedEnvironmentIds).toBe(true)
  })

  it('scopes deletes to the organization', async () => {
    const prisma = {
      apiKey: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as any
    const service = new ApiKeysService(prisma)
    await service.delete('key-1', 'org-1')
    expect(prisma.apiKey.deleteMany).toHaveBeenCalledWith({
      where: { id: 'key-1', organizationId: 'org-1' },
    })
  })
})
