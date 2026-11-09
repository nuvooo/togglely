/**
 * Minimal in-memory stand-in for the Prisma models used by the webhook
 * module (unit tests only). Each operation runs synchronously inside its
 * promise, so updateMany behaves atomically like a single MongoDB update.
 */

type Row = Record<string, any>

function isPlainObject(value: unknown): value is Record<string, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    !Array.isArray(value)
  )
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  return a === b
}

export function matches(row: Row, where: Row = {}): boolean {
  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue
    if (key === 'OR') {
      if (!(condition as Row[]).some((c) => matches(row, c))) return false
      continue
    }
    if (key === 'AND') {
      if (!(condition as Row[]).every((c) => matches(row, c))) return false
      continue
    }
    const value = row[key]
    if (condition === null) {
      if (value !== null) return false
      continue
    }
    if (!isPlainObject(condition)) {
      if (!same(value, condition)) return false
      continue
    }
    if ('in' in condition && !condition.in.some((c: unknown) => same(value, c)))
      return false
    if ('equals' in condition && !same(value, condition.equals)) return false
    if ('not' in condition && same(value, condition.not)) return false
    if ('lt' in condition && !(value != null && value < condition.lt))
      return false
    if ('lte' in condition && !(value != null && value <= condition.lte))
      return false
    if ('gt' in condition && !(value != null && value > condition.gt))
      return false
    if ('isSet' in condition && (value !== undefined) !== condition.isSet)
      return false
    if ('has' in condition && !(value ?? []).includes(condition.has))
      return false
  }
  return true
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (isPlainObject(value) && 'increment' in value) {
      row[key] = (row[key] ?? 0) + value.increment
    } else {
      row[key] = value
    }
  }
  row.updatedAt = new Date()
}

function pick(row: Row, select?: Row): Row {
  if (!select) return { ...row }
  const out: Row = {}
  for (const key of Object.keys(select)) if (select[key]) out[key] = row[key]
  return out
}

let counter = 0
function objectId(): string {
  counter += 1
  return counter.toString(16).padStart(24, '0')
}

function uniqueError() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
}

function sortRows(rows: Row[], orderBy?: Row | Row[]) {
  const orders = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : []
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [key, dir] = Object.entries(order)[0]
      const av = a[key]
      const bv = b[key]
      if (av < bv) return dir === 'asc' ? -1 : 1
      if (av > bv) return dir === 'asc' ? 1 : -1
    }
    return 0
  })
}

function model(rows: Row[], options: { unique?: string[] } = {}) {
  const violatesUnique = (candidate: Row, except?: Row) =>
    options.unique &&
    rows.some(
      (r) =>
        r !== except && options.unique!.every((k) => same(r[k], candidate[k]))
    )
  return {
    rows,
    findUnique: jest.fn(async ({ where, select }: Row) => {
      const row = rows.find((r) => matches(r, where))
      return row ? pick(row, select) : null
    }),
    findFirst: jest.fn(async ({ where, select, orderBy }: Row = {}) => {
      const row = sortRows(
        rows.filter((r) => matches(r, where)),
        orderBy
      )[0]
      return row ? pick(row, select) : null
    }),
    findMany: jest.fn(async ({ where, select, orderBy, take }: Row = {}) => {
      const found = sortRows(
        rows.filter((r) => matches(r, where)),
        orderBy
      )
      return found.slice(0, take ?? found.length).map((r) => pick(r, select))
    }),
    count: jest.fn(
      async ({ where }: Row = {}) =>
        rows.filter((r) => matches(r, where)).length
    ),
    create: jest.fn(async ({ data }: Row) => {
      const row: Row = {
        id: objectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }
      if (violatesUnique(row)) throw uniqueError()
      rows.push(row)
      return { ...row }
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = rows.find((r) => matches(r, where))
      if (!row) {
        throw Object.assign(new Error('Record not found'), { code: 'P2025' })
      }
      applyData(row, data)
      return { ...row }
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const found = rows.filter((r) => matches(r, where))
      for (const row of found) applyData(row, data)
      return { count: found.length }
    }),
    delete: jest.fn(async ({ where }: Row) => {
      const index = rows.findIndex((r) => matches(r, where))
      if (index === -1) {
        throw Object.assign(new Error('Record not found'), { code: 'P2025' })
      }
      return rows.splice(index, 1)[0]
    }),
    deleteMany: jest.fn(async ({ where }: Row = {}) => {
      const keep = rows.filter((r) => !matches(r, where))
      const count = rows.length - keep.length
      rows.splice(0, rows.length, ...keep)
      return { count }
    }),
  }
}

export function createFakeWebhookPrisma() {
  const webhooks: Row[] = []
  const deliveries: Row[] = []
  const webhook = model(webhooks)
  const webhookDelivery = model(deliveries, {
    unique: ['webhookId', 'eventId'],
  })

  // Deliveries support `include: { webhook: true }`
  webhookDelivery.findUnique = jest.fn(async ({ where, include }: Row) => {
    const row = deliveries.find((r) => matches(r, where))
    if (!row) return null
    const out: Row = { ...row }
    if (include?.webhook) {
      const parent = webhooks.find((w) => w.id === row.webhookId)
      out.webhook = parent ? { ...parent } : null
    }
    return out
  })
  // Cascade like the Prisma relation
  const deleteWebhook = webhook.delete
  webhook.delete = jest.fn(async (args: Row) => {
    const removed = await deleteWebhook(args)
    const keep = deliveries.filter((d) => d.webhookId !== removed.id)
    deliveries.splice(0, deliveries.length, ...keep)
    return removed
  })

  return {
    webhook,
    webhookDelivery,
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    project: { findUnique: jest.fn(), findFirst: jest.fn() },
    environment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    configVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    organizationMember: { findFirst: jest.fn() },
  }
}

export type FakeWebhookPrisma = ReturnType<typeof createFakeWebhookPrisma>
