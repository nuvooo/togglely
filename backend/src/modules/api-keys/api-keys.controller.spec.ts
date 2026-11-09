import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ApiKeysController } from './api-keys.controller'

const USER = '64a000000000000000000001'
const ORG = '64a000000000000000000010'

function setup(role = 'VIEWER') {
  const service = {
    findByOrganization: jest.fn().mockResolvedValue([{ id: 'k1' }]),
    findByUser: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'k2', key: 'tk_full' }),
    delete: jest.fn().mockResolvedValue(undefined),
  } as any
  const access = {
    assertOrgRole: jest.fn().mockResolvedValue({ role }),
    assertApiKeyAccess: jest
      .fn()
      .mockResolvedValue({ apiKey: { id: 'k1', organizationId: ORG } }),
  } as any
  const controller = new ApiKeysController(service, access)
  return { controller, service, access, req: { user: { userId: USER } } }
}

describe('ApiKeysController', () => {
  it('lists the keys of an organization for VIEWERs, masked by their role', async () => {
    const { controller, service, access, req } = setup('VIEWER')
    await expect(controller.findByOrganization(ORG, req)).resolves.toEqual({
      apiKeys: [{ id: 'k1' }],
    })
    expect(access.assertOrgRole).toHaveBeenCalledWith(USER, ORG, 'VIEWER')
    expect(service.findByOrganization).toHaveBeenCalledWith(ORG, 'VIEWER')
  })

  it('does not list keys of organizations the user is not a member of', async () => {
    const { controller, service, access, req } = setup()
    access.assertOrgRole.mockRejectedValue(new NotFoundException())
    await expect(
      controller.findByOrganization(ORG, req)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(service.findByOrganization).not.toHaveBeenCalled()
  })

  it('requires ADMIN to create keys and returns the plain key once', async () => {
    const { controller, service, access, req } = setup('ADMIN')
    const dto = { name: 'Web', type: 'CLIENT', expiresInDays: 30 }
    await expect(controller.create(ORG, dto, req)).resolves.toEqual({
      apiKey: { id: 'k2', key: 'tk_full' },
    })
    expect(access.assertOrgRole).toHaveBeenCalledWith(USER, ORG, 'ADMIN')
    expect(service.create).toHaveBeenCalledWith(ORG, USER, dto)
  })

  it('does not create keys for MEMBERs', async () => {
    const { controller, service, access, req } = setup('MEMBER')
    access.assertOrgRole.mockRejectedValue(new ForbiddenException())
    await expect(
      controller.create(ORG, { name: 'Web' }, req)
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(service.create).not.toHaveBeenCalled()
  })

  it('deletes keys as ADMIN, scoped to the key organization', async () => {
    const { controller, service, access, req } = setup('ADMIN')
    await expect(controller.delete('k1', req)).resolves.toEqual({
      success: true,
    })
    expect(access.assertApiKeyAccess).toHaveBeenCalledWith(USER, 'k1', 'ADMIN')
    expect(service.delete).toHaveBeenCalledWith('k1', ORG)
  })
})
