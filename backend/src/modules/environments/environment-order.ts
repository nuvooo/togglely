import { Prisma } from '@prisma/client'

/**
 * Canonical order of a project's environments: the user-defined sortOrder,
 * creation time as tie-breaker (legacy rows that all share sortOrder 0).
 * Use it for every query or include that lists environments.
 */
export const ENVIRONMENT_ORDER_BY: Prisma.EnvironmentOrderByWithRelationInput[] =
  [{ sortOrder: 'asc' }, { createdAt: 'asc' }]

interface Orderable {
  sortOrder: number
  createdAt: Date
}

export function compareEnvironmentOrder(a: Orderable, b: Orderable): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.createdAt.getTime() - b.createdAt.getTime()
}

/**
 * Sorts rows that carry their environment relation (e.g. FlagEnvironment
 * with `include: { environment: true }`) in environment order. Returns a
 * new array.
 */
export function sortByEnvironmentOrder<T extends { environment: Orderable }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) =>
    compareEnvironmentOrder(a.environment, b.environment)
  )
}

/**
 * Sorts rows referencing an environment (`environmentId`) in the order of
 * `orderedEnvs` (already in environment order, e.g. from ENVIRONMENT_ORDER_BY).
 * Rows of unknown environments go last. Returns a new array.
 */
export function sortByEnvironmentPosition<T extends { environmentId: string }>(
  rows: T[],
  orderedEnvs: { id: string }[]
): T[] {
  const position = new Map(orderedEnvs.map((env, i) => [env.id, i]))
  const pos = (row: T) => position.get(row.environmentId) ?? orderedEnvs.length
  return [...rows].sort((a, b) => pos(a) - pos(b))
}
