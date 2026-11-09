import { createFakeWebhookPrisma } from './testing/fake-webhook-prisma'
import { WebhookDeliveryService } from './webhook-delivery.service'
import { DELIVERY_RETENTION_DAYS, WebhookWorker } from './webhook-worker'

async function seedDue(
  prisma: ReturnType<typeof createFakeWebhookPrisma>,
  n: number
) {
  const hook = await prisma.webhook.create({
    data: {
      organizationId: 'org',
      projectId: 'p1',
      url: 'https://hooks.example.com/t',
      secret: 'whsec_x',
      environmentIds: [],
      enabled: true,
      consecutiveFailures: 0,
      createdById: 'u',
    },
  })
  for (let i = 0; i < n; i++) {
    await prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        eventId: `evt_${i}`,
        event: { id: `evt_${i}`, type: 'flags.changed' },
        attempt: 0,
        status: 'pending',
        nextAttemptAt: new Date(Date.now() - 1000),
        lockedUntil: null,
      },
    })
  }
  return hook
}

describe('WebhookWorker', () => {
  const originalEnv = process.env.WEBHOOK_WORKER_DISABLED

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.WEBHOOK_WORKER_DISABLED
    else process.env.WEBHOOK_WORKER_DISABLED = originalEnv
    jest.useRealTimers()
  })

  it('delivers due deliveries', async () => {
    const prisma = createFakeWebhookPrisma()
    await seedDue(prisma, 3)
    const send = jest
      .fn()
      .mockResolvedValue({ ok: true, responseCode: 200, durationMs: 1 })
    const worker = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, send)
    )

    await expect(worker.tick()).resolves.toBe(3)

    expect(send).toHaveBeenCalledTimes(3)
    expect(
      prisma.webhookDelivery.rows.every((d) => d.status === 'success')
    ).toBe(true)
  })

  it('processes at most 20 deliveries per tick', async () => {
    const prisma = createFakeWebhookPrisma()
    await seedDue(prisma, 25)
    const send = jest
      .fn()
      .mockResolvedValue({ ok: true, responseCode: 200, durationMs: 1 })
    const worker = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, send)
    )
    await expect(worker.tick()).resolves.toBe(20)
    await expect(worker.tick()).resolves.toBe(5)
  })

  it('never sends a delivery twice when two workers run concurrently', async () => {
    const prisma = createFakeWebhookPrisma()
    await seedDue(prisma, 15)
    const sentIds: string[] = []
    const send = jest.fn().mockImplementation(async (request: any) => {
      sentIds.push(request.headers['X-Togglely-Delivery'])
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { ok: true, responseCode: 200, durationMs: 5 }
    })
    const a = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, send)
    )
    const b = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, send)
    )

    const [na, nb] = await Promise.all([a.tick(), b.tick()])

    expect(na + nb).toBe(15)
    expect(sentIds).toHaveLength(15)
    expect(new Set(sentIds).size).toBe(15)
  })

  it('does not overlap ticks of the same worker', async () => {
    const prisma = createFakeWebhookPrisma()
    await seedDue(prisma, 2)
    const send = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { ok: true, responseCode: 200, durationMs: 5 }
    })
    const worker = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, send)
    )
    const [first, second] = await Promise.all([worker.tick(), worker.tick()])
    expect(first + second).toBe(2)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('keeps going when a single attempt throws', async () => {
    const prisma = createFakeWebhookPrisma()
    await seedDue(prisma, 2)
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ ok: true, responseCode: 200, durationMs: 1 })
    const worker = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, send)
    )
    await expect(worker.tick()).resolves.toBe(2)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it(`deletes deliveries older than ${DELIVERY_RETENTION_DAYS} days`, async () => {
    const prisma = createFakeWebhookPrisma()
    const hook = await seedDue(prisma, 1)
    await prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        eventId: 'old',
        event: {},
        status: 'success',
        createdAt: new Date(Date.now() - 31 * 24 * 3600 * 1000),
      },
    })
    const worker = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, jest.fn())
    )

    await expect(worker.cleanup()).resolves.toBe(1)
    expect(prisma.webhookDelivery.rows.map((d) => d.eventId)).toEqual(['evt_0'])
  })

  it('polls every 10 s when enabled and stops on shutdown', async () => {
    jest.useFakeTimers()
    delete process.env.WEBHOOK_WORKER_DISABLED
    const prisma = createFakeWebhookPrisma()
    const worker = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, jest.fn())
    )
    const tick = jest.spyOn(worker, 'tick').mockResolvedValue(0)

    worker.onModuleInit()
    await jest.advanceTimersByTimeAsync(10_000)
    expect(tick).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(10_000)
    expect(tick).toHaveBeenCalledTimes(2)

    worker.onModuleDestroy()
    await jest.advanceTimersByTimeAsync(30_000)
    expect(tick).toHaveBeenCalledTimes(2)
  })

  it('does not start timers when WEBHOOK_WORKER_DISABLED=true', async () => {
    jest.useFakeTimers()
    process.env.WEBHOOK_WORKER_DISABLED = 'true'
    const prisma = createFakeWebhookPrisma()
    const worker = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, jest.fn())
    )
    const tick = jest.spyOn(worker, 'tick').mockResolvedValue(0)

    worker.onModuleInit()
    worker.trigger()
    await jest.advanceTimersByTimeAsync(60_000)

    expect(tick).not.toHaveBeenCalled()
    worker.onModuleDestroy()
  })

  it('trigger() runs a tick right away', async () => {
    delete process.env.WEBHOOK_WORKER_DISABLED
    const prisma = createFakeWebhookPrisma()
    await seedDue(prisma, 1)
    const send = jest
      .fn()
      .mockResolvedValue({ ok: true, responseCode: 200, durationMs: 1 })
    const worker = new WebhookWorker(
      prisma as any,
      new WebhookDeliveryService(prisma as any, send)
    )
    worker.onModuleInit()
    try {
      worker.trigger()
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(send).toHaveBeenCalledTimes(1)
    } finally {
      worker.onModuleDestroy()
    }
  })
})
