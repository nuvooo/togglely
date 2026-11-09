import { FlagType } from '@prisma/client'
import { getDefaultFlagValue } from '../sdk/sdk.helpers'

export interface FlagStateRow {
  environmentKey: string
  brandKey: string | null
  enabled: boolean
  value: string
}

/** One default row per environment (missing = off/default) plus every brand override row. */
export function collectFlagStates(
  flag: {
    flagType: FlagType
    flagEnvironments: {
      environmentId: string
      brandId: string | null
      enabled: boolean
      defaultValue: string
    }[]
  },
  environments: { id: string; key: string }[],
  brands: { id: string; key: string }[]
): FlagStateRow[] {
  const brandKeyById = new Map(brands.map((b) => [b.id, b.key]))
  const rows: FlagStateRow[] = []
  for (const env of environments) {
    const base = flag.flagEnvironments.find(
      (fe) => fe.environmentId === env.id && !fe.brandId
    )
    rows.push({
      environmentKey: env.key,
      brandKey: null,
      enabled: base?.enabled ?? false,
      value: base?.defaultValue ?? getDefaultFlagValue(flag.flagType),
    })
    for (const fe of flag.flagEnvironments) {
      if (fe.environmentId !== env.id || !fe.brandId) continue
      const brandKey = brandKeyById.get(fe.brandId)
      if (!brandKey) continue
      rows.push({
        environmentKey: env.key,
        brandKey,
        enabled: fe.enabled,
        value: fe.defaultValue,
      })
    }
  }
  return rows
}

/**
 * Rows that differ from the most common (enabled,value) state. Ties resolve
 * to the state of the first row. Returns [] when all rows are equal.
 */
export function findDivergentStates(rows: FlagStateRow[]): FlagStateRow[] {
  if (rows.length === 0) return []
  const stateOf = (r: FlagStateRow) => JSON.stringify([r.enabled, r.value])
  const counts = new Map<string, number>()
  for (const r of rows)
    counts.set(stateOf(r), (counts.get(stateOf(r)) ?? 0) + 1)
  let best = stateOf(rows[0])
  let bestCount = counts.get(best) ?? 0
  for (const [state, count] of counts) {
    if (count > bestCount) {
      best = state
      bestCount = count
    }
  }
  return rows.filter((r) => stateOf(r) !== best)
}
