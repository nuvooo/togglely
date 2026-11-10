/** Optional time window of a targeting rule. */
export interface RuleWindow {
  activeFrom?: Date | null
  activeUntil?: Date | null
}

/**
 * A rule applies while `activeFrom <= now < activeUntil`; a missing bound is
 * open.
 */
export function isRuleActiveAt(rule: RuleWindow, now: Date): boolean {
  if (rule.activeFrom && now < rule.activeFrom) return false
  if (rule.activeUntil && now >= rule.activeUntil) return false
  return true
}

/**
 * Next bound after `now` at which the rule switches on or off, or null.
 * The rule scheduler announces a configuration change at that time.
 */
export function nextBoundaryAfter(rule: RuleWindow, now: Date): Date | null {
  const future = [rule.activeFrom, rule.activeUntil].filter(
    (d): d is Date => !!d && d > now
  )
  if (future.length === 0) return null
  return new Date(Math.min(...future.map((d) => d.getTime())))
}
