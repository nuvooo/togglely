import { createHmac } from 'node:crypto'
import {
  createFakeWebhookPrisma,
  FakeWebhookPrisma,
} from './testing/fake-webhook-prisma'
import { WebhookDeliveryService } from './webhook-delivery.service'
import { HttpAttemptResult } from './webhook-http'
import { planAfterFailure, RETRY_DELAYS_SECONDS } from './webhook-payload'

const SECRET = 'whsec_c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0LXNlY3I'
const PAYLOAD = {
  id: 'evt_1',
  type: 'flags.changed',
  createdAt: '2026-11-09T10:00:00.000Z',
  organizationId: 'org',
  project: { id: 'p1', key: 'shop' },
  environment: { id: 'e1', key: 'production' },
  version: 3,
  changes: [{ flagKey: 'checkout', action: 'toggled' }],
}

function setup(
  result: Partial<HttpAttemptResult> = { ok: true, responseCode: 200 }
) {
  const prisma = createFakeWebhookPrisma()
  const send = jest.fn().mockResolvedValue({ durationMs: 12, ...result })
  const service = new WebhookDeliveryService(prisma as any, send)
  return { prisma, send, service }
}

async function seed(
  prisma: FakeWebhookPrisma,
  webhook: Record<string, unknown> = {},
  delivery: Record<string, unknown> = {}
) {
  const hook = await prisma.webhook.create({
    data: {
      organizationId: 'org',
      projectId: 'p1',
      url: 'https://hooks.example.com/t',
      secret: SECRET,
      environmentIds: [],
      enabled: true,
      consecutiveFailures: 0,
      createdById: 'user',
      ...webhook,
    },
  })
  const row = await prisma.webhookDelivery.create({
    data: {
      webhookId: hook.id,
      eventId: 'evt_1',
      event: PAYLOAD,
      attempt: 0,
      status: 'pending',
      nextAttemptAt: new Date(Date.now() - 1000),
      lockedUntil: null,
      ...delivery,
    },
  })
  return { hook, row }
}

describe('planAfterFailure', () => {
  const now = new Date('2026-11-09T10:00:00Z')

  it.each([
    [1, 60],
    [2, 300],
    [3, 1800],
    [4, 7200],
    [5, 43200],
  ])('schedules attempt %i + 1 after %i seconds', (attempt, seconds) => {
    expect(planAfterFailure(attempt, now)).toEqual({
      status: 'pending',
      nextAttemptAt: new Date(now.getTime() + seconds * 1000),
    })
  })

  it('gives up after the last retry', () => {
    expect(planAfterFailure(RETRY_DELAYS_SECONDS.length + 1, now)).toEqual({
      status: 'failed',
      nextAttemptAt: null,
    })
  })
})

describe('WebhookDeliveryService', () => {
  it('sends the stored payload with the documented, signed headers', async () => {
    const { prisma, send, service } = setup()
    const { hook, row } = await seed(prisma)

    await service.attempt(row.id)

    expect(send).toHaveBeenCalledTimes(1)
    const request = send.mock.calls[0][0]
    expect(request.url).toBe(hook.url)
    expect(JSON.parse(request.body)).toEqual(PAYLOAD)
    expect(request.headers).toMatchObject({
      'Content-Type': 'application/json',
      'User-Agent': 'Togglely-Webhooks/1',
      'X-Togglely-Event': 'flags.changed',
      'X-Togglely-Delivery': row.id,
    })
    const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(
      request.headers['X-Togglely-Signature']
    )
    expect(match).not.toBeNull()
    const [, t, v1] = match!
    expect(Math.abs(Number(t) - Date.now() / 1000)).toBeLessThan(5)
    expect(v1).toBe(
      createHmac('sha256', SECRET).update(`${t}.${request.body}`).digest('hex')
    )
  })

  it('marks a successful delivery and resets the failure counter', async () => {
    const { prisma, service } = setup({
      ok: true,
      responseCode: 204,
      responseBody: '',
    })
    const { hook, row } = await seed(prisma, { consecutiveFailures: 7 })

    const updated = await service.attempt(row.id)

    expect(updated).toMatchObject({
      status: 'success',
      attempt: 1,
      responseCode: 204,
      durationMs: 12,
      nextAttemptAt: null,
      lockedUntil: null,
      error: null,
    })
    const stored = prisma.webhook.rows.find((w) => w.id === hook.id)!
    expect(stored).toMatchObject({
      consecutiveFailures: 0,
      lastStatus: 'success',
    })
    expect(stored.lastDeliveryAt).toBeInstanceOf(Date)
  })

  it('schedules a retry after a failure', async () => {
    const { prisma, service } = setup({
      ok: false,
      responseCode: 500,
      responseBody: 'boom',
      error: 'unexpected_status',
    })
    const { hook, row } = await seed(prisma)

    const before = Date.now()
    const updated = await service.attempt(row.id)

    expect(updated).toMatchObject({
      status: 'pending',
      attempt: 1,
      responseCode: 500,
      responseBody: 'boom',
      error: 'unexpected_status',
      lockedUntil: null,
    })
    const next = (updated!.nextAttemptAt as Date).getTime()
    expect(next).toBeGreaterThanOrEqual(before + 60_000)
    expect(next).toBeLessThan(before + 65_000)
    expect(prisma.webhook.rows.find((w) => w.id === hook.id)).toMatchObject({
      consecutiveFailures: 1,
      lastStatus: 'failed',
    })
  })

  it('marks the delivery failed after the last retry', async () => {
    const { prisma, service } = setup({ ok: false, error: 'timeout' })
    const { row } = await seed(prisma, {}, { attempt: 5 })

    const updated = await service.attempt(row.id)

    expect(updated).toMatchObject({
      status: 'failed',
      attempt: 6,
      nextAttemptAt: null,
      error: 'timeout',
    })
  })

  it('auto-disables the webhook after 20 consecutive failures (audited once)', async () => {
    const { prisma, service } = setup({ ok: false, error: 'timeout' })
    const { hook, row } = await seed(prisma, { consecutiveFailures: 19 })

    await service.attempt(row.id)

    const stored = prisma.webhook.rows.find((w) => w.id === hook.id)!
    expect(stored).toMatchObject({ enabled: false, consecutiveFailures: 20 })
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'webhook.auto_disabled',
      entityType: 'webhook',
      entityId: hook.id,
      organizationId: 'org',
      projectId: 'p1',
    })
  })

  it('does not disable below the threshold', async () => {
    const { prisma, service } = setup({ ok: false, error: 'timeout' })
    const { hook, row } = await seed(prisma, { consecutiveFailures: 17 })

    await service.attempt(row.id)

    expect(prisma.webhook.rows.find((w) => w.id === hook.id)!.enabled).toBe(
      true
    )
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('does not send for disabled webhooks', async () => {
    const { prisma, send, service } = setup()
    const { row } = await seed(prisma, { enabled: false })

    const updated = await service.attempt(row.id)

    expect(send).not.toHaveBeenCalled()
    expect(updated).toMatchObject({
      status: 'failed',
      error: 'webhook_disabled',
      lockedUntil: null,
    })
  })

  it('can send to a disabled webhook on explicit request (test/redeliver)', async () => {
    const { prisma, send, service } = setup()
    const { row } = await seed(prisma, { enabled: false })

    await service.attempt(row.id, { allowDisabled: true })

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('returns null when the delivery no longer exists', async () => {
    const { send, service } = setup()
    await expect(
      service.attempt('ffffffffffffffffffffffff')
    ).resolves.toBeNull()
    expect(send).not.toHaveBeenCalled()
  })

  it('passes the URL policy from the environment', async () => {
    const { prisma, send, service } = setup()
    const { row } = await seed(prisma)
    process.env.WEBHOOK_ALLOW_PRIVATE = 'true'
    try {
      await service.attempt(row.id)
    } finally {
      delete process.env.WEBHOOK_ALLOW_PRIVATE
    }
    expect(send.mock.calls[0][0].policy).toEqual({
      allowPrivate: true,
      allowInsecure: false,
    })
  })

  describe('claim', () => {
    it('locks a free delivery exactly once', async () => {
      const { prisma, service } = setup()
      const { row } = await seed(prisma)

      const results = await Promise.all([
        service.claim(row.id),
        service.claim(row.id),
      ])

      expect(results.filter(Boolean)).toHaveLength(1)
      const stored = prisma.webhookDelivery.rows.find((d) => d.id === row.id)!
      expect(stored.lockedUntil.getTime()).toBeGreaterThan(Date.now())
    })

    it('takes over an expired lock', async () => {
      const { prisma, service } = setup()
      const { row } = await seed(
        prisma,
        {},
        { lockedUntil: new Date(Date.now() - 1000) }
      )
      await expect(service.claim(row.id)).resolves.toBe(true)
    })

    it('claims deliveries without a lockedUntil field', async () => {
      const { prisma, service } = setup()
      const { row } = await seed(prisma, {}, { lockedUntil: undefined })
      delete prisma.webhookDelivery.rows[0].lockedUntil
      await expect(service.claim(row.id)).resolves.toBe(true)
    })
  })

  describe('claimDue', () => {
    it('claims at most `limit` due, unlocked, pending deliveries', async () => {
      const { prisma, service } = setup()
      const { hook } = await seed(prisma)
      const past = new Date(Date.now() - 1000)
      for (let i = 0; i < 25; i++) {
        await prisma.webhookDelivery.create({
          data: {
            webhookId: hook.id,
            eventId: `due_${i}`,
            event: PAYLOAD,
            attempt: 0,
            status: 'pending',
            nextAttemptAt: past,
            lockedUntil: null,
          },
        })
      }
      await prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          eventId: 'future',
          event: PAYLOAD,
          status: 'pending',
          nextAttemptAt: new Date(Date.now() + 60_000),
          lockedUntil: null,
        },
      })
      await prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          eventId: 'done',
          event: PAYLOAD,
          status: 'success',
          nextAttemptAt: null,
          lockedUntil: null,
        },
      })

      const first = await service.claimDue(20)
      const second = await service.claimDue(20)

      expect(first).toHaveLength(20)
      // 26 due (25 + seed) - 20 already locked
      expect(second).toHaveLength(6)
      expect(new Set([...first, ...second]).size).toBe(26)
      const third = await service.claimDue(20)
      expect(third).toHaveLength(0)
    })
  })
})
