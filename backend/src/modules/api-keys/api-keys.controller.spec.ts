import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ApiKeysController } from './api-keys.controller'

const USER = '64a000000000000000000001'
const ORG = '64a000000000000000000010'
const PROJECT = '64a000000000000000000020'
const ENV = '64a000000000000000000030'

function setup(role = 'VIEWER') {
  const service = {
    findByOrganization: jest.fn().mockResolvedValue([{ id: 'k1' }]),
    findByUser: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'k2', key: 'tk_full' }),
    delete: jest.fn().mockResolvedValue(undefined),
  } as any
  const access = {
    assertOrgRole: jest.fn().mockResolvedValue({ role }),
    assertApiKeyAccess: jest.fn().mockResolvedValue({
      apiKey: { id: 'k1', organizationId: ORG, type: 'SERVER', userId: 'x' },
      membership: { role },
    }),
    assertProjectAccess: jest.fn().mockResolvedValue({
      project: { id: PROJECT, organizationId: ORG },
    }),
    assertEnvironmentInProject: jest.fn().mockResolvedValue(undefined),
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
    expect(service.findByOrganization).toHaveBeenCalledWith(ORG, 'VIEWER', USER)
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
    expect(access.assertApiKeyAccess).toHaveBeenCalledWith(USER, 'k1', 'MEMBER')
    expect(service.delete).toHaveBeenCalledWith('k1', ORG)
  })

  describe('MCP keys', () => {
    const mcpDto = {
      name: 'Claude',
      type: 'MCP',
      projectId: PROJECT,
      allowedEnvironmentIds: [ENV],
    }

    it('MEMBER may create MCP key', async () => {
      const { controller, service, access, req } = setup('MEMBER')
      await controller.create(ORG, mcpDto, req)
      expect(access.assertOrgRole).toHaveBeenCalledWith(USER, ORG, 'MEMBER')
      expect(service.create).toHaveBeenCalledWith(ORG, USER, mcpDto)
    })

    it('MEMBER creating SERVER key -> 403', async () => {
      const { controller, service, access, req } = setup('MEMBER')
      access.assertOrgRole.mockImplementation(
        async (_u: string, _o: string, min: string) => {
          if (min === 'ADMIN') throw new ForbiddenException()
          return { role: 'MEMBER' }
        }
      )
      await expect(
        controller.create(ORG, { name: 'x', type: 'SERVER' }, req)
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(access.assertOrgRole).toHaveBeenCalledWith(USER, ORG, 'ADMIN')
      expect(service.create).not.toHaveBeenCalled()
    })

    it('VIEWER creating MCP key -> 403', async () => {
      const { controller, service, access, req } = setup('VIEWER')
      access.assertOrgRole.mockRejectedValue(new ForbiddenException())
      await expect(controller.create(ORG, mcpDto, req)).rejects.toBeInstanceOf(
        ForbiddenException
      )
      expect(service.create).not.toHaveBeenCalled()
    })

    it('MCP key create checks project belongs to org', async () => {
      const { controller, service, access, req } = setup('MEMBER')
      await controller.create(ORG, mcpDto, req)
      expect(access.assertProjectAccess).toHaveBeenCalledWith(
        USER,
        PROJECT,
        'MEMBER'
      )
      access.assertProjectAccess.mockResolvedValue({
        project: { id: PROJECT, organizationId: 'other-org' },
      })
      service.create.mockClear()
      await expect(controller.create(ORG, mcpDto, req)).rejects.toBeInstanceOf(
        NotFoundException
      )
      expect(service.create).not.toHaveBeenCalled()
    })

    it('MCP key create rejects environment of another project', async () => {
      const { controller, service, access, req } = setup('MEMBER')
      access.assertEnvironmentInProject.mockRejectedValue(
        new NotFoundException()
      )
      await expect(controller.create(ORG, mcpDto, req)).rejects.toBeInstanceOf(
        NotFoundException
      )
      expect(access.assertEnvironmentInProject).toHaveBeenCalledWith(
        ENV,
        PROJECT
      )
      expect(service.create).not.toHaveBeenCalled()
    })

    it('MEMBER may delete own MCP key', async () => {
      const { controller, service, access, req } = setup('MEMBER')
      access.assertApiKeyAccess.mockResolvedValue({
        apiKey: { id: 'k1', organizationId: ORG, type: 'MCP', userId: USER },
        membership: { role: 'MEMBER' },
      })
      await controller.delete('k1', req)
      expect(service.delete).toHaveBeenCalledWith('k1', ORG)
    })

    it("MEMBER deleting someone else's MCP key -> 403", async () => {
      const { controller, service, access, req } = setup('MEMBER')
      access.assertApiKeyAccess.mockResolvedValue({
        apiKey: { id: 'k1', organizationId: ORG, type: 'MCP', userId: 'x' },
        membership: { role: 'MEMBER' },
      })
      await expect(controller.delete('k1', req)).rejects.toBeInstanceOf(
        ForbiddenException
      )
      expect(service.delete).not.toHaveBeenCalled()
    })

    it('MEMBER deleting own non-MCP key -> 403', async () => {
      const { controller, service, access, req } = setup('MEMBER')
      access.assertApiKeyAccess.mockResolvedValue({
        apiKey: { id: 'k1', organizationId: ORG, type: 'SERVER', userId: USER },
        membership: { role: 'MEMBER' },
      })
      await expect(controller.delete('k1', req)).rejects.toBeInstanceOf(
        ForbiddenException
      )
      expect(service.delete).not.toHaveBeenCalled()
    })

    it('ADMIN deletes any key', async () => {
      const { controller, service, access, req } = setup('ADMIN')
      access.assertApiKeyAccess.mockResolvedValue({
        apiKey: { id: 'k1', organizationId: ORG, type: 'MCP', userId: 'x' },
        membership: { role: 'ADMIN' },
      })
      await controller.delete('k1', req)
      expect(service.delete).toHaveBeenCalledWith('k1', ORG)
    })
  })
})
