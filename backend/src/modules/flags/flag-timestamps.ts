interface Timestamped {
  updatedAt?: Date | null
}

/**
 * Last change of a flag: the newest updatedAt of the flag itself and all of
 * its value rows (default and brand). Toggling a value only touches the
 * FlagEnvironment row, so flag.updatedAt alone would miss it.
 */
export function latestFlagUpdate(
  flag: Timestamped & { flagEnvironments?: Timestamped[] }
): Date | undefined {
  let latest = flag.updatedAt ?? undefined
  for (const fe of flag.flagEnvironments ?? []) {
    if (fe.updatedAt && (!latest || fe.updatedAt > latest))
      latest = fe.updatedAt
  }
  return latest
}
