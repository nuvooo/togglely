import { BadRequestException, NotFoundException } from '@nestjs/common'
import { AuditLogsController } from './audit-logs.controller'

const USER = '64a000000000000000000001'
const PROJECT = '64a000000000000000000020'
const FLAG = '64a000000000000000000030'

function setup() {
  const service = {
    findAll: jest.fn().mockResolvedValue([{ id: 'log-1' }]),
  } as any
  const access = {
    assertProjectAccess: jest
      .fn()
      .mockResolvedValue({ project: { id: PROJECT, organizationId: 'o1' } }),
  } as any
  const controller = new AuditLogsController(service, access)
  const req = { user: { userId: USER } }
  return { controller, service, access, req }
}

describe('AuditLogsController findAll (project)', () => {
  it('returns the latest project entries without filters', async () => {
    const { controller, service, access, req } = setup()
    await expect(controller.findAll(PROJECT, req)).resolves.toEqual({
      auditLogs: [{ id: 'log-1' }],
    })
    expect(access.assertProjectAccess).toHaveBeenCalledWith(
      USER,
      PROJECT,
      'VIEWER'
    )
    expect(service.findAll).toHaveBeenCalledWith(PROJECT, {
      entityId: undefined,
      limit: undefined,
    })
  })

  it('passes entityId and limit to the service', async () => {
    const { controller, service, req } = setup()
    await controller.findAll(PROJECT, req, FLAG, '200')
    expect(service.findAll).toHaveBeenCalledWith(PROJECT, {
      entityId: FLAG,
      limit: 200,
    })
  })

  it.each([
    ['a malformed entityId', 'nope', undefined],
    ['a limit above 200', FLAG, '201'],
    ['a non-numeric limit', FLAG, 'ten'],
    ['a zero limit', FLAG, '0'],
  ])('rejects %s', async (_name, entityId, limit) => {
    const { controller, service, access, req } = setup()
    await expect(
      controller.findAll(PROJECT, req, entityId, limit)
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(access.assertProjectAccess).not.toHaveBeenCalled()
    expect(service.findAll).not.toHaveBeenCalled()
  })

  it('does not query for projects the user cannot see', async () => {
    const { controller, service, access, req } = setup()
    access.assertProjectAccess.mockRejectedValue(new NotFoundException())
    await expect(controller.findAll(PROJECT, req, FLAG)).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(service.findAll).not.toHaveBeenCalled()
  })
})

describe('AuditLogsController findByOrganization', () => {
  const ORG = '64a000000000000000000010'

  function orgSetup() {
    const page = { auditLogs: [{ id: 'log-1' }], nextCursor: null }
    const service = {
      findOrganizationPage: jest.fn().mockResolvedValue(page),
    } as any
    const access = {
      assertOrgRole: jest.fn().mockResolvedValue({ role: 'VIEWER' }),
    } as any
    const controller = new AuditLogsController(service, access)
    return {
      controller,
      service,
      access,
      page,
      req: { user: { userId: USER } },
    }
  }

  it('lets VIEWERs read the page of their organization', async () => {
    const { controller, service, access, page, req } = orgSetup()
    await expect(controller.findByOrganization(ORG, req, {})).resolves.toEqual(
      page
    )
    expect(access.assertOrgRole).toHaveBeenCalledWith(USER, ORG, 'VIEWER')
    expect(service.findOrganizationPage).toHaveBeenCalledWith(ORG, {})
  })

  it('passes the validated filters to the service', async () => {
    const { controller, service, req } = orgSetup()
    await controller.findByOrganization(ORG, req, {
      limit: '25',
      before: '2026-11-09T10:00:00.000Z',
      projectId: PROJECT,
      userId: USER,
      action: 'webhook.',
    })
    expect(service.findOrganizationPage).toHaveBeenCalledWith(ORG, {
      limit: 25,
      before: new Date('2026-11-09T10:00:00.000Z'),
      projectId: PROJECT,
      userId: USER,
      action: 'webhook.',
    })
  })

  it('rejects invalid filters of members', async () => {
    const { controller, service, req } = orgSetup()
    await expect(
      controller.findByOrganization(ORG, req, { limit: '500' })
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      controller.findByOrganization(ORG, req, { action: 'flag.*' })
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(service.findOrganizationPage).not.toHaveBeenCalled()
  })

  it('answers non-members with 404 regardless of the query', async () => {
    const { controller, service, access, req } = orgSetup()
    access.assertOrgRole.mockRejectedValue(new NotFoundException())
    await expect(
      controller.findByOrganization(ORG, req, { limit: '500' })
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(service.findOrganizationPage).not.toHaveBeenCalled()
  })

  it('does not query organizations the user is not a member of', async () => {
    const { controller, service, access, req } = orgSetup()
    access.assertOrgRole.mockRejectedValue(new NotFoundException())
    await expect(
      controller.findByOrganization(ORG, req, {})
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(service.findOrganizationPage).not.toHaveBeenCalled()
  })
})
