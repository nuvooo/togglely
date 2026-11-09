import { NotFoundException } from '@nestjs/common'
import { SetupController } from './setup.controller'

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed') }))

function createController(enabled = 'true') {
  const order: string[] = []
  const track =
    (name: string, result: unknown = { count: 0 }) =>
    jest.fn(async (args?: any) => {
      const projectId = args?.where?.projectId
      order.push(projectId ? `${name}:${projectId}` : name)
      return result
    })
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 'user-2' }),
    },
    organizationMember: {
      findMany: jest.fn().mockResolvedValue([{ organizationId: 'org-1' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    organization: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'org-2' }),
    },
    project: {
      findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
      deleteMany: track('project.deleteMany'),
      create: jest.fn().mockResolvedValue({ id: 'p3' }),
    },
    flagEnvironment: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    featureFlag: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    environment: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    brand: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    configVersion: { deleteMany: track('configVersion.deleteMany') },
    webhook: {
      findMany: jest.fn(async ({ where }: any) =>
        where.projectId === 'p1' ? [{ id: 'hook-1' }] : []
      ),
      deleteMany: track('webhook.deleteMany'),
    },
    webhookDelivery: { deleteMany: track('webhookDelivery.deleteMany') },
  }
  const config = { get: jest.fn().mockReturnValue(enabled) }
  const controller = new SetupController(prisma as any, config as any)
  return { controller, prisma, order }
}

describe('SetupController.resetDemo', () => {
  it('is hidden unless ENABLE_DEMO_RESET=true', async () => {
    const { controller, prisma } = createController('false')
    await expect(controller.resetDemo()).rejects.toThrow(NotFoundException)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('removes change data (versions, webhooks, deliveries) of every project before deleting it', async () => {
    const { controller, prisma, order } = createController()

    await controller.resetDemo()

    for (const projectId of ['p1', 'p2']) {
      expect(prisma.configVersion.deleteMany).toHaveBeenCalledWith({
        where: { projectId },
      })
      expect(prisma.webhook.deleteMany).toHaveBeenCalledWith({
        where: { projectId },
      })
    }
    expect(prisma.webhookDelivery.deleteMany).toHaveBeenCalledWith({
      where: { webhookId: { in: ['hook-1'] } },
    })
    expect(order.indexOf('webhook.deleteMany:p1')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('webhook.deleteMany:p2')).toBeLessThan(
      order.indexOf('project.deleteMany')
    )
  })
})
