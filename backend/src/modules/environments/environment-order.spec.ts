import {
  compareEnvironmentOrder,
  ENVIRONMENT_ORDER_BY,
  sortByEnvironmentOrder,
  sortByEnvironmentPosition,
} from './environment-order'

const d = (n: number) => new Date(2024, 0, n)

describe('environment order', () => {
  it('orders by sortOrder, then createdAt (Prisma orderBy)', () => {
    expect(ENVIRONMENT_ORDER_BY).toEqual([
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ])
  })

  it('compares by sortOrder first and createdAt as tie-breaker', () => {
    const envs = [
      { id: 'c', sortOrder: 1, createdAt: d(1) },
      { id: 'b', sortOrder: 0, createdAt: d(3) },
      { id: 'a', sortOrder: 0, createdAt: d(2) },
    ]
    expect([...envs].sort(compareEnvironmentOrder).map((e) => e.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('sorts rows by their related environment without mutating the input', () => {
    const rows = [
      { id: 'fe-prod', environment: { sortOrder: 1, createdAt: d(1) } },
      { id: 'fe-dev', environment: { sortOrder: 0, createdAt: d(2) } },
    ]
    const sorted = sortByEnvironmentOrder(rows)
    expect(sorted.map((r) => r.id)).toEqual(['fe-dev', 'fe-prod'])
    expect(rows[0].id).toBe('fe-prod')
  })

  it('sorts rows by the position of their environment in an ordered list', () => {
    const rows = [
      { id: 'x', environmentId: 'gone' },
      { id: 'p', environmentId: 'prod' },
      { id: 'd', environmentId: 'dev' },
    ]
    const sorted = sortByEnvironmentPosition(rows, [
      { id: 'dev' },
      { id: 'prod' },
    ])
    expect(sorted.map((r) => r.id)).toEqual(['d', 'p', 'x'])
  })
})
