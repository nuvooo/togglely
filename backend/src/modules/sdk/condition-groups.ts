import { RuleOperator } from '@prisma/client'

export interface ConditionGroup<C> {
  operator: RuleOperator
  conditions: C[]
}

/**
 * Condition groups of a rule. Each condition carries its group
 * (`groupIndex`, null = 0), `groupOperators[i]` combines the conditions of
 * group i, and the rule `operator` combines the groups. Rules saved before
 * groups existed have no groupOperators: they are one group combined with
 * the rule operator, exactly as before.
 */
export function groupConditions<
  C extends { groupIndex?: number | null },
>(rule: {
  operator: RuleOperator
  groupOperators?: RuleOperator[] | null
  conditions: C[]
}): ConditionGroup<C>[] {
  const operators = rule.groupOperators ?? []
  const buckets = new Map<number, C[]>()
  for (const condition of rule.conditions) {
    const index = condition.groupIndex ?? 0
    buckets.set(index, [...(buckets.get(index) ?? []), condition])
  }
  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((index) => ({
      operator: operators[index] ?? rule.operator,
      conditions: buckets.get(index) ?? [],
    }))
}
