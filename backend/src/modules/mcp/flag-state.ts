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

/**
 * Human readable reasons that block deleting a flag: enabled targeting rules
 * (per environment/brand row) and experiments that have not ended.
 */
export function describeDeleteBlockers(
  flagEnvironments: {
    id: string
    environmentId: string
    brandId: string | null
  }[],
  enabledRules: { flagEnvId: string }[],
  openExperiments: { key: string; status: string }[],
  environments: { id: string; key: string }[],
  brands: { id: string; key: string }[]
): string[] {
  const blockers: string[] = []
  const envKeyById = new Map(environments.map((e) => [e.id, e.key]))
  const brandKeyById = new Map(brands.map((b) => [b.id, b.key]))
  const ruleRows = new Set(enabledRules.map((r) => r.flagEnvId))
  const locations = flagEnvironments
    .filter((fe) => ruleRows.has(fe.id))
    .map((fe) => {
      const env = envKeyById.get(fe.environmentId) ?? fe.environmentId
      if (!fe.brandId) return env
      return `${env}/${brandKeyById.get(fe.brandId) ?? fe.brandId}`
    })
  if (locations.length > 0) {
    blockers.push(
      `enabled targeting rules in: ${locations.join(', ')} (disable or remove them first)`
    )
  }
  for (const exp of openExperiments) {
    blockers.push(`experiment "${exp.key}" is ${exp.status} (end it first)`)
  }
  return blockers
}
