// Types and pure helpers for the targeting-rules API
// (GET/POST/PATCH/DELETE /feature-flags/:flagId/targeting-rules).

export type ConditionOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'IN'
  | 'NOT_IN'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'MATCHES_REGEX'

export type RuleMatchOperator = 'AND' | 'OR'

export type FlagType = 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'

export interface TargetingCondition {
  id: string
  attribute: string
  operator: ConditionOperator
  value: string
}

export interface TargetingRule {
  id: string
  environmentId: string
  brandId: string | null
  name: string | null
  operator: RuleMatchOperator
  serveValue: string
  priority: number
  isDefault: boolean
  enabled: boolean
  conditions: TargetingCondition[]
  createdAt: string
  updatedAt: string
}

export interface ConditionInput {
  attribute: string
  operator: ConditionOperator
  value: string
}

export interface CreateTargetingRuleInput {
  environmentId: string
  name?: string
  operator: RuleMatchOperator
  serveValue: string
  priority: number
  enabled?: boolean
  conditions: ConditionInput[]
}

export const CONDITION_OPERATORS: {
  value: ConditionOperator
  label: string
}[] = [
  { value: 'EQUALS', label: 'equals' },
  { value: 'NOT_EQUALS', label: 'not equals' },
  { value: 'CONTAINS', label: 'contains' },
  { value: 'NOT_CONTAINS', label: 'does not contain' },
  { value: 'GREATER_THAN', label: 'greater than' },
  { value: 'LESS_THAN', label: 'less than' },
  { value: 'IN', label: 'in list' },
  { value: 'NOT_IN', label: 'not in list' },
  { value: 'STARTS_WITH', label: 'starts with' },
  { value: 'ENDS_WITH', label: 'ends with' },
  { value: 'MATCHES_REGEX', label: 'matches regex' },
]

export const MAX_CONDITIONS = 20
export const MAX_RULE_NAME_LENGTH = 200
export const MAX_CONDITION_VALUE_LENGTH = 1000
export const ATTRIBUTE_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/

export function isListOperator(operator: ConditionOperator): boolean {
  return operator === 'IN' || operator === 'NOT_IN'
}

/** IN / NOT_IN: comma-separated entries, trimmed, empty ones dropped. */
export function normalizeConditionValue(
  operator: ConditionOperator,
  value: string
): string {
  if (!isListOperator(operator)) return value
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .join(',')
}

/** "country EQUALS DE" */
export function formatCondition(condition: ConditionInput): string {
  return `${condition.attribute} ${condition.operator} ${condition.value}`
}

/** Joins all conditions with AND / OR depending on the rule match mode. */
export function formatConditions(
  conditions: ConditionInput[],
  operator: RuleMatchOperator
): string {
  return conditions.map(formatCondition).join(` ${operator} `)
}

export function sortRulesByPriority(rules: TargetingRule[]): TargetingRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority)
}

/** Priority for a newly created rule: one after the current maximum. */
export function nextPriority(rules: Pick<TargetingRule, 'priority'>[]): number {
  if (rules.length === 0) return 0
  return Math.max(...rules.map((r) => r.priority)) + 1
}

/** Returns an error message, or null if the serve value fits the flag type. */
export function validateServeValue(
  flagType: FlagType,
  value: string
): string | null {
  switch (flagType) {
    case 'BOOLEAN':
      return value === 'true' || value === 'false'
        ? null
        : 'Serve value must be true or false'
    case 'NUMBER':
      return value.trim() !== '' && Number.isFinite(Number(value))
        ? null
        : 'Serve value must be a number'
    case 'JSON':
      try {
        JSON.parse(value)
        return null
      } catch {
        return 'Serve value must be valid JSON'
      }
    default:
      return null
  }
}

/** Client-side mirror of the backend validation. Server stays authoritative. */
export function validateRuleInput(
  flagType: FlagType,
  input: Omit<CreateTargetingRuleInput, 'environmentId' | 'priority'>
): string | null {
  if (input.name && input.name.length > MAX_RULE_NAME_LENGTH) {
    return `Rule name must be at most ${MAX_RULE_NAME_LENGTH} characters`
  }
  if (input.conditions.length === 0) {
    return 'At least one condition is required'
  }
  if (input.conditions.length > MAX_CONDITIONS) {
    return `At most ${MAX_CONDITIONS} conditions are allowed`
  }
  for (const [index, condition] of input.conditions.entries()) {
    if (!ATTRIBUTE_PATTERN.test(condition.attribute)) {
      return `Condition ${index + 1}: attribute may only contain letters, digits, "_", "." and "-" (max 100 characters)`
    }
    if (condition.value.length > MAX_CONDITION_VALUE_LENGTH) {
      return `Condition ${index + 1}: value must be at most ${MAX_CONDITION_VALUE_LENGTH} characters`
    }
  }
  return validateServeValue(flagType, input.serveValue)
}
