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
