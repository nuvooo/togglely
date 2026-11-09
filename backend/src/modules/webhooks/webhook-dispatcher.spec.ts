import { InMemoryChangeBus } from '../change-events/change-bus'
import { FlagsChangedEvent } from '../change-events/change-events.types'
import { createFakeWebhookPrisma } from './testing/fake-webhook-prisma'
import { WebhookDispatcher } from './webhook-dispatcher'

const EVENT: FlagsChangedEvent = {
  eventId: 'evt_abc',
  organizationId: 'org',
  projectId: 'p1',
  projectKey: 'shop',
  environmentId: 'env_prod',
  environmentKey: 'production',
  version: 7,
  changes: [{ flagKey: 'checkout', action: 'toggled' }],
  createdAt: '2026-11-09T10:00:00.000Z',
}

async function addWebhook(
  prisma: ReturnType<typeof createFakeWebhookPrisma>,
  data: Record<string, unknown> = {}
) {
  return prisma.webhook.create({
    data: {
      organizationId: 'org',
      projectId: 'p1',
      url: 'https://hooks.example.com/t',
      secret: 'whsec_x',
      environmentIds: [],
      enabled: true,
      consecutiveFailures: 0,
      createdById: 'u',
      ...data,
    },
  })
}

function setup() {
  const prisma = createFakeWebhookPrisma()
  const bus = new InMemoryChangeBus()
  const worker = { trigger: jest.fn() }
  const dispatcher = new WebhookDispatcher(prisma as any, bus, worker as any)
  return { prisma, bus, worker, dispatcher }
}

describe('WebhookDispatcher', () => {
  it('creates a pending delivery per matching, enabled webhook', async () => {
    const { prisma, dispatcher, worker } = setup()
    const all = await addWebhook(prisma)
    const prodOnly = await addWebhook(prisma, { environmentIds: ['env_prod'] })
    await addWebhook(prisma, { environmentIds: ['env_staging'] })
    await addWebhook(prisma, { enabled: false })
    await addWebhook(prisma, { projectId: 'p2' })

    await expect(dispatcher.dispatch(EVENT)).resolves.toBe(2)

    const rows = prisma.webhookDelivery.rows
    expect(rows.map((r) => r.webhookId).sort()).toEqual(
      [all.id, prodOnly.id].sort()
    )
    expect(rows[0]).toMatchObject({
      eventId: 'evt_abc',
      status: 'pending',
      attempt: 0,
      lockedUntil: null,
      event: {
        id: 'evt_abc',
        type: 'flags.changed',
        createdAt: EVENT.createdAt,
        organizationId: 'org',
        project: { id: 'p1', key: 'shop' },
        environment: { id: 'env_prod', key: 'production' },
        version: 7,
        changes: [{ flagKey: 'checkout', action: 'toggled' }],
      },
    })
    expect(rows[0].nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(worker.trigger).toHaveBeenCalledTimes(1)
  })

  it('is idempotent when the same event arrives twice (Redis fan-out)', async () => {
    const { prisma, dispatcher } = setup()
    await addWebhook(prisma)

    await dispatcher.dispatch(EVENT)
    await expect(dispatcher.dispatch(EVENT)).resolves.toBe(0)

    expect(prisma.webhookDelivery.rows).toHaveLength(1)
  })

  it('ignores unique-constraint races (P2002) between instances', async () => {
    const { prisma, dispatcher, worker } = setup()
    await addWebhook(prisma)
    prisma.webhookDelivery.create.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 'P2002' })
    )

    await expect(dispatcher.dispatch(EVENT)).resolves.toBe(0)
    expect(worker.trigger).not.toHaveBeenCalled()
  })

  it('continues with other webhooks when one create fails', async () => {
    const { prisma, dispatcher } = setup()
    await addWebhook(prisma)
    await addWebhook(prisma)
    prisma.webhookDelivery.create.mockRejectedValueOnce(new Error('db down'))

    await expect(dispatcher.dispatch(EVENT)).resolves.toBe(1)
  })

  it('subscribes to the change bus on init and unsubscribes on destroy', async () => {
    const { prisma, bus, dispatcher } = setup()
    await addWebhook(prisma)
    dispatcher.onModuleInit()

    await bus.publish(EVENT)
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    expect(prisma.webhookDelivery.rows).toHaveLength(1)

    dispatcher.onModuleDestroy()
    await bus.publish({ ...EVENT, eventId: 'evt_other' })
    await new Promise((resolve) => setImmediate(resolve))
    expect(prisma.webhookDelivery.rows).toHaveLength(1)
  })

  it('keeps the truncated marker in the payload', async () => {
    const { prisma, dispatcher } = setup()
    await addWebhook(prisma)
    await dispatcher.dispatch({ ...EVENT, truncated: true })
    expect(prisma.webhookDelivery.rows[0].event.truncated).toBe(true)
  })
})
