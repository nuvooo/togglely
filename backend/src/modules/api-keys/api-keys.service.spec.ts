import { BadRequestException } from '@nestjs/common'
import { ApiKeysService, maskApiKey } from './api-keys.service'

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

  it('lists the environment binding and never the creator user', async () => {
    const prisma = {
      apiKey: { findMany: jest.fn().mockResolvedValue([]) },
    } as any
    await new ApiKeysService(prisma).findByOrganization('o', 'ADMIN')
    const select = prisma.apiKey.findMany.mock.calls[0][0].select
    expect(select.environmentId).toBe(true)
    expect(select.userId).toBeUndefined()
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
