import type { FeatureFlag, FlagType, ProjectEnvironment } from './types'
import { FLAG_TYPES } from './types'

/** Filter chip ids: everything, enabled in the last environment, or one type. */
export type FlagFilter = 'all' | 'enabled' | FlagType

export const isFlagFilter = (value: string | null): value is FlagFilter =>
  value === 'all' ||
  value === 'enabled' ||
  (FLAG_TYPES as string[]).includes(value ?? '')

/**
 * Environment columns in API order (`sortOrder`): the project's environment
 * list when available, otherwise the order in which the flags list them.
 */
export function environmentColumns(
  projectEnvironments: ProjectEnvironment[] | undefined,
  flags: FeatureFlag[]
): ProjectEnvironment[] {
  if (projectEnvironments && projectEnvironments.length > 0) {
    return projectEnvironments
  }
  const seen = new Map<string, ProjectEnvironment>()
  for (const flag of flags) {
    for (const env of flag.environments ?? []) {
      if (!seen.has(env.environmentId)) {
        seen.set(env.environmentId, {
          id: env.environmentId,
          name: env.environmentName,
          key: env.environmentName,
        })
      }
    }
  }
  return [...seen.values()]
}

export const isEnabledIn = (flag: FeatureFlag, environmentId: string) =>
  flag.environments?.some(
    (env) => env.environmentId === environmentId && env.enabled
  ) ?? false

/** Case-insensitive match on name or key. */
export function matchesSearch(flag: FeatureFlag, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    (flag.name ?? '').toLowerCase().includes(q) ||
    (flag.key ?? '').toLowerCase().includes(q)
  )
}

export function matchesFilter(
  flag: FeatureFlag,
  filter: FlagFilter,
  lastEnvironmentId: string | undefined
) {
  if (filter === 'all') return true
  if (filter === 'enabled') {
    return lastEnvironmentId ? isEnabledIn(flag, lastEnvironmentId) : false
  }
  return flag.flagType === filter
}

/** "3 hours ago" in the given locale; `null` for missing/invalid dates. */
export function formatRelative(
  date: string | undefined,
  locale: string,
  now: number = Date.now()
): string | null {
  if (!date) return null
  const time = new Date(date).getTime()
  if (Number.isNaN(time)) return null
  const seconds = Math.round((time - now) / 1000)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(Math.round(seconds / size), unit)
    }
  }
  return rtf.format(0, 'second')
}
