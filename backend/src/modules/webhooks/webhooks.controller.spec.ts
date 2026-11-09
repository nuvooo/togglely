import {
  ArgumentMetadata,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto'
import { createFakeWebhookPrisma } from './testing/fake-webhook-prisma'
import { WebhookDeliveryService } from './webhook-delivery.service'
import { WebhooksController } from './webhooks.controller'
import { MAX_WEBHOOKS_PER_PROJECT, WebhooksService } from './webhooks.service'

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const PROJECT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const ORG_ID = 'cccccccccccccccccccccccc'
const ENV_ID = 'eeeeeeeeeeeeeeeeeeeeeeee'
const OTHER_ENV_ID = 'ffffffffffffffffffffffff'
const MISSING_ID = '999999999999999999999999'
const URL = 'https://hooks.example.com/togglely'

const req = { user: { userId: USER_ID } }

function setup(role: string | null = 'ADMIN') {
  const prisma = createFakeWebhookPrisma()
  prisma.project.findUnique.mockResolvedValue({
    id: PROJECT_ID,
    organizationId: ORG_ID,
    key: 'shop',
  })
  prisma.organizationMember.findFirst.mockResolvedValue(
    role ? { userId: USER_ID, organizationId: ORG_ID, role } : null
  )
  prisma.environment.findMany.mockImplementation(async ({ where }: any) =>
    (where.id.in as string[])
      .filter((id) => id === ENV_ID)
      .map((id) => ({ id }))
  )
  prisma.environment.findFirst.mockResolvedValue({
    id: ENV_ID,
    key: 'production',
  })
  prisma.configVersion.findFirst.mockResolvedValue({ version: 4 })

  const send = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      responseCode: 200,
      responseBody: 'ok',
      durationMs: 3,
    })
  const auditLogs = { create: jest.fn().mockResolvedValue({}) }
  const lookup = jest
    .fn()
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  const deliveries = new WebhookDeliveryService(prisma as any, send)
  const service = new WebhooksService(
    prisma as any,
    auditLogs as any,
    deliveries,
    lookup
  )
  const controller = new WebhooksController(
    service,
    new AccessService(prisma as any)
  )
  return { prisma, send, auditLogs, lookup, controller }
}

async function createWebhook(
  controller: WebhooksController,
  dto: Partial<CreateWebhookDto> = {}
) {
  return controller.create(
    PROJECT_ID,
    { url: URL, ...dto } as CreateWebhookDto,
    req
  )
}

/** Creates a webhook as ADMIN, then switches the caller to `role`. */
async function withExisting(role: string | null) {
  const ctx = setup('ADMIN')
  const { webhook } = await createWebhook(ctx.controller)
  const delivery = await ctx.prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      eventId: 'evt_1',
      event: { id: 'evt_1', type: 'flags.changed' },
      attempt: 6,
      status: 'failed',
      nextAttemptAt: null,
      lockedUntil: null,
    },
  })
  ctx.prisma.organizationMember.findFirst.mockResolvedValue(
    role ? { userId: USER_ID, organizationId: ORG_ID, role } : null
  )
  ctx.auditLogs.create.mockClear()
  ctx.send.mockClear()
  return { ...ctx, webhook, delivery }
}

describe('WebhooksController access control', () => {
  const reads: Array<
    [string, (c: WebhooksController, id: string, d: string) => Promise<unknown>]
  > = [
    ['list', (c) => c.list(PROJECT_ID, req)],
    ['deliveries', (c, id) => c.deliveries(PROJECT_ID, id, undefined, req)],
  ]
  const writes: Array<
    [string, (c: WebhooksController, id: string, d: string) => Promise<unknown>]
  > = [
    ['create', (c) => createWebhook(c)],
    ['update', (c, id) => c.update(PROJECT_ID, id, { enabled: false }, req)],
    ['delete', (c, id) => c.delete(PROJECT_ID, id, req)],
    ['rotateSecret', (c, id) => c.rotateSecret(PROJECT_ID, id, req)],
    ['test', (c, id) => c.test(PROJECT_ID, id, req)],
    ['redeliver', (c, id, d) => c.redeliver(PROJECT_ID, id, d, req)],
  ]

  it.each([...reads, ...writes])(
    '%s: non-members get 404',
    async (_name, call) => {
      const { controller, webhook, delivery, send, prisma } =
        await withExisting(null)
      const before = prisma.webhook.rows.map((w) => ({ ...w }))
      await expect(call(controller, webhook.id, delivery.id)).rejects.toThrow(
        NotFoundException
      )
      expect(send).not.toHaveBeenCalled()
      expect(prisma.webhook.rows).toEqual(before)
    }
  )

  it.each(
    writes.flatMap(([name, call]) => [
      ['VIEWER', name, call] as const,
      ['MEMBER', name, call] as const,
    ])
  )('%s cannot %s (403)', async (role, _name, call) => {
    const { controller, webhook, delivery, send, prisma } =
      await withExisting(role)
    const before = prisma.webhook.rows.map((w) => ({ ...w }))
    await expect(call(controller, webhook.id, delivery.id)).rejects.toThrow(
      ForbiddenException
    )
    expect(send).not.toHaveBeenCalled()
    expect(prisma.webhook.rows).toEqual(before)
  })

  it.each(reads)('%s: VIEWER is rejected (403)', async (_name, call) => {
    const { controller, webhook, delivery } = await withExisting('VIEWER')
    await expect(call(controller, webhook.id, delivery.id)).rejects.toThrow(
      ForbiddenException
    )
  })

  it.each(reads)('%s: MEMBER may read', async (_name, call) => {
    const { controller, webhook, delivery } = await withExisting('MEMBER')
    await expect(
      call(controller, webhook.id, delivery.id)
    ).resolves.toBeDefined()
  })

  it('returns 404 for webhooks of another project', async () => {
    const { controller, prisma, webhook } = await withExisting('ADMIN')
    prisma.webhook.rows[0].projectId = '0123456789abcdef01234567'
    await expect(
      controller.rotateSecret(PROJECT_ID, webhook.id, req)
    ).rejects.toThrow(NotFoundException)
    await expect(
      controller.rotateSecret(PROJECT_ID, 'not-an-id', req)
    ).rejects.toThrow(NotFoundException)
  })
})

describe('WebhooksController', () => {
  it('creates a webhook and returns the secret exactly once', async () => {
    const { controller, prisma, auditLogs } = setup()

    const created = await createWebhook(controller, {
      description: '  Deploy hook ',
      environmentIds: [ENV_ID, ENV_ID],
    })

    expect(created.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/)
    expect(created.webhook).toMatchObject({
      projectId: PROJECT_ID,
      url: URL,
      description: 'Deploy hook',
      environmentIds: [ENV_ID],
      enabled: true,
      consecutiveFailures: 0,
      lastStatus: null,
    })
    expect(created.webhook.secret).toBe(`whsec_…${created.secret.slice(-4)}`)
    expect(prisma.webhook.rows[0]).toMatchObject({
      secret: created.secret,
      organizationId: ORG_ID,
      createdById: USER_ID,
    })
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webhook.created',
        entityType: 'webhook',
      })
    )
    expect(JSON.stringify(auditLogs.create.mock.calls)).not.toContain(
      created.secret
    )

    const { webhooks } = await controller.list(PROJECT_ID, req)
    expect(webhooks).toHaveLength(1)
    expect(webhooks[0].secret).toBe(created.webhook.secret)
    expect(JSON.stringify(webhooks)).not.toContain(created.secret)
  })

  it('masks the secret on update and returns a new one on rotation', async () => {
    const { controller, prisma, webhook, auditLogs } =
      await withExisting('ADMIN')
    const oldSecret = prisma.webhook.rows[0].secret

    const updated = await controller.update(
      PROJECT_ID,
      webhook.id,
      { description: 'x' },
      req
    )
    expect(updated.webhook.secret).toMatch(/^whsec_…/)
    expect(JSON.stringify(updated)).not.toContain(oldSecret)

    const rotated = await controller.rotateSecret(PROJECT_ID, webhook.id, req)
    expect(rotated.secret).not.toBe(oldSecret)
    expect(prisma.webhook.rows[0].secret).toBe(rotated.secret)
    expect(rotated.webhook.secret).toBe(`whsec_…${rotated.secret.slice(-4)}`)
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'webhook.secret_rotated' })
    )
    expect(JSON.stringify(auditLogs.create.mock.calls)).not.toContain(
      rotated.secret
    )
  })

  it(`allows at most ${MAX_WEBHOOKS_PER_PROJECT} webhooks per project`, async () => {
    const { controller } = setup()
    for (let i = 0; i < MAX_WEBHOOKS_PER_PROJECT; i++)
      await createWebhook(controller)
    await expect(createWebhook(controller)).rejects.toThrow(BadRequestException)
  })

  it('rejects environments of other projects', async () => {
    const { controller, prisma } = setup()
    await expect(
      createWebhook(controller, { environmentIds: [OTHER_ENV_ID] })
    ).rejects.toThrow(BadRequestException)
    expect(prisma.webhook.rows).toHaveLength(0)
  })

  it.each([
    ['https://127.0.0.1/hook', 'blocked_private_address'],
    ['https://localhost/hook', 'blocked_private_address'],
    ['https://[::ffff:10.0.0.1]/hook', 'blocked_private_address'],
    ['http://hooks.example.com/hook', 'insecure_scheme'],
    ['https://user:pw@hooks.example.com/', 'credentials_in_url'],
    ['not a url', 'invalid_url'],
  ])('rejects %s with 400 (%s)', async (url, code) => {
    const { controller, prisma } = setup()
    const error = await createWebhook(controller, { url }).catch((e) => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(error.getResponse()).toMatchObject({ code })
    expect(prisma.webhook.rows).toHaveLength(0)
  })

  it('rejects hostnames that resolve to private addresses', async () => {
    const { controller, lookup } = setup()
    lookup.mockResolvedValue([{ address: '10.0.0.8', family: 4 }])
    await expect(createWebhook(controller)).rejects.toThrow(BadRequestException)
  })

  it('accepts URLs whose host does not resolve yet', async () => {
    const { controller, lookup } = setup()
    lookup.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'ENOTFOUND' })
    )
    await expect(createWebhook(controller)).resolves.toBeDefined()
  })

  it('allows private and http targets when the operator enables them', async () => {
    const { controller } = setup()
    process.env.WEBHOOK_ALLOW_PRIVATE = 'true'
    process.env.WEBHOOK_ALLOW_INSECURE = 'true'
    try {
      await expect(
        createWebhook(controller, { url: 'http://127.0.0.1:9000/hook' })
      ).resolves.toBeDefined()
    } finally {
      delete process.env.WEBHOOK_ALLOW_PRIVATE
      delete process.env.WEBHOOK_ALLOW_INSECURE
    }
  })

  it('validates the URL on update', async () => {
    const { controller, webhook } = await withExisting('ADMIN')
    await expect(
      controller.update(
        PROJECT_ID,
        webhook.id,
        { url: 'https://169.254.169.254/' },
        req
      )
    ).rejects.toThrow(BadRequestException)
  })

  it('resets the failure streak when a webhook is re-enabled', async () => {
    const { controller, prisma, webhook } = await withExisting('ADMIN')
    Object.assign(prisma.webhook.rows[0], {
      enabled: false,
      consecutiveFailures: 20,
    })
    const { webhook: updated } = await controller.update(
      PROJECT_ID,
      webhook.id,
      { enabled: true },
      req
    )
    expect(updated).toMatchObject({ enabled: true, consecutiveFailures: 0 })
  })

  it('deletes a webhook with its deliveries', async () => {
    const { controller, prisma, webhook, auditLogs } =
      await withExisting('ADMIN')
    await expect(
      controller.delete(PROJECT_ID, webhook.id, req)
    ).resolves.toEqual({
      success: true,
    })
    expect(prisma.webhook.rows).toHaveLength(0)
    expect(prisma.webhookDelivery.rows).toHaveLength(0)
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'webhook.deleted' })
    )
  })

  it('sends a webhook.test event immediately and returns the result', async () => {
    const { controller, webhook, send } = await withExisting('ADMIN')

    const { delivery } = await controller.test(PROJECT_ID, webhook.id, req)

    expect(send).toHaveBeenCalledTimes(1)
    const body = JSON.parse(send.mock.calls[0][0].body)
    expect(body).toMatchObject({
      type: 'webhook.test',
      organizationId: ORG_ID,
      project: { id: PROJECT_ID, key: 'shop' },
      environment: { id: ENV_ID, key: 'production' },
      version: 4,
      changes: [],
    })
    expect(body.id).toMatch(/^test_/)
    expect(send.mock.calls[0][0].headers['X-Togglely-Event']).toBe(
      'webhook.test'
    )
    expect(delivery).toMatchObject({
      type: 'webhook.test',
      status: 'success',
      attempt: 1,
      responseCode: 200,
      eventId: body.id,
    })
  })

  it('fails a test delivery immediately without retries or failure count', async () => {
    const { controller, prisma, webhook, send } = await withExisting('ADMIN')
    prisma.webhook.rows[0].consecutiveFailures = 19
    send.mockResolvedValue({
      ok: false,
      responseCode: 500,
      error: 'unexpected_status',
      durationMs: 2,
    })
    const { delivery } = await controller.test(PROJECT_ID, webhook.id, req)
    expect(delivery).toMatchObject({
      status: 'failed',
      nextAttemptAt: null,
      manual: true,
    })
    const stored = prisma.webhookDelivery.rows.find(
      (d) => d.id === delivery.id
    )!
    expect(stored).toMatchObject({ manual: true, lockToken: null })
    expect(prisma.webhook.rows[0]).toMatchObject({
      enabled: true,
      consecutiveFailures: 19,
    })
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('does not count a failed redeliver toward auto-disable', async () => {
    const { controller, prisma, webhook, delivery, send } =
      await withExisting('ADMIN')
    prisma.webhook.rows[0].consecutiveFailures = 19
    send.mockResolvedValue({ ok: false, error: 'timeout', durationMs: 2 })

    await controller.redeliver(PROJECT_ID, webhook.id, delivery.id, req)

    expect(prisma.webhook.rows[0]).toMatchObject({
      enabled: true,
      consecutiveFailures: 19,
    })
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('lists deliveries newest first with a bounded limit', async () => {
    const { controller, prisma, webhook } = await withExisting('MEMBER')
    for (let i = 0; i < 60; i++) {
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          eventId: `e${i}`,
          event: { type: 'flags.changed' },
          status: 'success',
          createdAt: new Date(Date.now() + i * 1000),
        },
      })
    }
    const all = await controller.deliveries(
      PROJECT_ID,
      webhook.id,
      undefined,
      req
    )
    expect(all.deliveries).toHaveLength(50)
    expect(all.deliveries[0].eventId).toBe('e59')
    const few = await controller.deliveries(PROJECT_ID, webhook.id, '5', req)
    expect(few.deliveries).toHaveLength(5)
    const many = await controller.deliveries(
      PROJECT_ID,
      webhook.id,
      '5000',
      req
    )
    expect(many.deliveries).toHaveLength(61)
    const junk = await controller.deliveries(PROJECT_ID, webhook.id, 'abc', req)
    expect(junk.deliveries).toHaveLength(50)
  })

  it('redelivers with the same event id and a fresh retry plan', async () => {
    const { controller, webhook, delivery, send } = await withExisting('ADMIN')

    const result = await controller.redeliver(
      PROJECT_ID,
      webhook.id,
      delivery.id,
      req
    )

    expect(send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(send.mock.calls[0][0].body).id).toBe('evt_1')
    expect(result.delivery).toMatchObject({
      id: delivery.id,
      status: 'success',
      attempt: 1,
    })
  })

  it('refuses to redeliver while a worker holds the delivery', async () => {
    const { controller, prisma, webhook, delivery, send } =
      await withExisting('ADMIN')
    prisma.webhookDelivery.rows[0].lockedUntil = new Date(Date.now() + 30_000)
    await expect(
      controller.redeliver(PROJECT_ID, webhook.id, delivery.id, req)
    ).rejects.toThrow(ConflictException)
    expect(send).not.toHaveBeenCalled()
  })

  it('returns 404 for deliveries of other webhooks', async () => {
    const { controller, webhook } = await withExisting('ADMIN')
    await expect(
      controller.redeliver(PROJECT_ID, webhook.id, MISSING_ID, req)
    ).rejects.toThrow(NotFoundException)
  })
})

describe('Webhook DTO validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true })
  const validate = (metatype: any, value: unknown) =>
    pipe.transform(value, { type: 'body', metatype } as ArgumentMetadata)

  it('accepts a valid create body and strips unknown fields', async () => {
    const dto = await validate(CreateWebhookDto, {
      url: URL,
      environmentIds: [ENV_ID],
      organizationId: 'x',
      secret: 'mine',
    })
    expect(dto).toEqual({ url: URL, environmentIds: [ENV_ID] })
  })

  it.each([
    [{}],
    [{ url: '' }],
    [{ url: `https://example.com/${'a'.repeat(2048)}` }],
    [{ url: URL, description: 'd'.repeat(201) }],
    [{ url: URL, environmentIds: ['not-an-id'] }],
    [{ url: URL, environmentIds: Array.from({ length: 21 }, () => ENV_ID) }],
    [{ url: URL, enabled: 'yes' }],
  ])('rejects invalid create body %j', async (body) => {
    await expect(validate(CreateWebhookDto, body)).rejects.toThrow(
      BadRequestException
    )
  })

  it('accepts a partial update', async () => {
    await expect(
      validate(UpdateWebhookDto, { enabled: false })
    ).resolves.toEqual({
      enabled: false,
    })
  })

  it('rejects an empty URL on update', async () => {
    await expect(validate(UpdateWebhookDto, { url: '' })).rejects.toThrow(
      BadRequestException
    )
  })
})
