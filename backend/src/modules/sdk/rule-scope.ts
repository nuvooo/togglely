/** Where a flag-wide targeting rule applies; empty lists mean "all". */
export interface RuleScope {
  environmentIds?: string[] | null
  environmentsExcluded?: boolean | null
  brandIds?: string[] | null
  brandsExcluded?: boolean | null
}

const matches = (
  ids: string[] | null | undefined,
  excluded: boolean | null | undefined,
  id: string | null
) => {
  if (!ids || ids.length === 0) return true
  const listed = id !== null && ids.includes(id)
  return excluded ? !listed : listed
}

/**
 * Whether a rule applies to an SDK request for `environmentId` and the
 * optional brand. "Brand is one of [...]" never matches a request without
 * a brand; "brand is none of [...]" does.
 */
export function ruleAppliesTo(
  rule: RuleScope,
  environmentId: string,
  brandId: string | null
): boolean {
  return (
    matches(rule.environmentIds, rule.environmentsExcluded, environmentId) &&
    matches(rule.brandIds, rule.brandsExcluded, brandId)
  )
}

/**
 * Environments whose SDK results these rules can change: their listed
 * environments, or 'all' when a rule is not limited to listed ones.
 */
export function scopedEnvironmentIds(rules: RuleScope[]): string[] | 'all' {
  const ids = new Set<string>()
  for (const rule of rules) {
    if (!rule.environmentIds?.length || rule.environmentsExcluded) return 'all'
    for (const id of rule.environmentIds) ids.add(id)
  }
  return [...ids]
}
