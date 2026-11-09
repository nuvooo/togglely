export interface Environment {
  id: string
  name: string
  key: string
}

export interface FlagCount {
  /** Flags switched on in the environment (default value, without brands). */
  active: number
  /** All flags of the project; every flag exists in every environment. */
  total: number
}

/** Flag row of `GET /feature-flags/project/:projectId` (only what the counts need). */
export interface ProjectFlag {
  environments?: { environmentId: string; enabled: boolean }[]
}

/**
 * Moves one environment a step up or down. Returns `null` when it cannot move
 * (unknown id, already first/last).
 */
export function moveEnvironment<T extends { id: string }>(
  list: T[],
  id: string,
  direction: 'up' | 'down'
): T[] | null {
  const index = list.findIndex((e) => e.id === id)
  if (index === -1) return null
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= list.length) return null
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/**
 * Active/total flags per environment id. The environment list itself carries no
 * counts, so they come from the project's flag list.
 */
export function countFlagsPerEnvironment(
  flags: ProjectFlag[],
  environments: { id: string }[]
): Record<string, FlagCount> {
  const counts: Record<string, FlagCount> = {}
  for (const env of environments)
    counts[env.id] = { active: 0, total: flags.length }
  for (const flag of flags) {
    for (const fe of flag.environments ?? []) {
      const count = counts[fe.environmentId]
      if (count && fe.enabled) count.active++
    }
  }
  return counts
}
