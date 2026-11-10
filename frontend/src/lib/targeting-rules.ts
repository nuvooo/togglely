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

/**
 * Where a flag-wide rule applies; empty lists mean "all", *Excluded turns
 * "one of" into "none of".
 */
export interface RuleScope {
  environmentIds: string[]
  environmentsExcluded: boolean
  brandIds: string[]
  brandsExcluded: boolean
}

export interface TargetingRule extends Partial<RuleScope> {
  id: string
  name: string | null
  operator: RuleMatchOperator
  serveValue: string
  priority: number
  isDefault: boolean
  enabled: boolean
  /** Optional time window (ISO); missing on older API versions. */
  activeFrom?: string | null
  activeUntil?: string | null
  /** All conditions, flat (see `conditionTree` for their logic). */
  conditions: TargetingCondition[]
  /** Conditions as AND/OR/NOT blocks; missing on older API versions. */
  conditionTree?: ConditionTree
  /** Condition groups of an older API version, see ruleTree. */
  groups?: TargetingRuleGroup[]
  createdAt: string
  updatedAt: string
}

/** Conditions combined with the group operator (AND: all, OR: any). */
export interface TargetingRuleGroup {
  operator: RuleMatchOperator
  conditions: TargetingCondition[]
}

export interface ConditionInput {
  attribute: string
  operator: ConditionOperator
  value: string
}

export interface CreateTargetingRuleInput {
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

export const MAX_TREE_DEPTH = 5

/** A single comparison against the evaluation context. */
export interface ConditionLeaf extends ConditionInput {
  type: 'condition'
}

/**
 * AND: all children match, OR: at least one matches, NOT: none matches
 * (like the "not" condition in Home Assistant).
 */
export interface ConditionBlock {
  type: 'AND' | 'OR' | 'NOT'
  children: ConditionNode[]
}

export type ConditionNode = ConditionLeaf | ConditionBlock

/** Root of a rule's conditions: always an AND or OR block. */
export interface ConditionTree extends ConditionBlock {
  type: RuleMatchOperator
}

const toLeaf = (c: ConditionInput): ConditionLeaf => ({
  type: 'condition',
  attribute: c.attribute,
  operator: c.operator,
  value: c.value,
})

/**
 * The rule's condition tree; older API versions only send flat conditions
 * (one block with the rule operator) or groups (blocks under the rule
 * operator, single conditions stay leaves).
 */
export function ruleTree(
  rule: Pick<
    TargetingRule,
    'operator' | 'conditions' | 'groups' | 'conditionTree'
  >
): ConditionTree {
  if (rule.conditionTree) return rule.conditionTree
  const groups = rule.groups?.length
    ? rule.groups
    : rule.conditions.length
      ? [{ operator: rule.operator, conditions: rule.conditions }]
      : []
  if (groups.length === 0) return { type: 'AND', children: [] }
  if (groups.length === 1) {
    return {
      type: groups[0].operator,
      children: groups[0].conditions.map(toLeaf),
    }
  }
  return {
    type: rule.operator,
    children: groups.map((g) =>
      g.conditions.length === 1
        ? toLeaf(g.conditions[0])
        : { type: g.operator, children: g.conditions.map(toLeaf) }
    ),
  }
}

/** All conditions of a tree, depth-first. */
export function treeLeaves(node: ConditionNode): ConditionLeaf[] {
  if (node.type === 'condition') return [node]
  return node.children.flatMap(treeLeaves)
}

/** Whether the tree has blocks below the root. */
export function hasNestedBlocks(tree: ConditionTree): boolean {
  return tree.children.some((child) => child.type !== 'condition')
}

/**
 * "a AND (b OR NOT (c OR d))": blocks below the root in parentheses; NOT
 * means none of its entries match, shown as NOT (x OR y).
 */
export function formatTree(node: ConditionNode, root = true): string {
  if (node.type === 'condition') return formatCondition(node)
  const separator = node.type === 'AND' ? ' AND ' : ' OR '
  const inner = node.children.map((c) => formatTree(c, false)).join(separator)
  if (node.type === 'NOT') return `NOT (${inner})`
  return root ? inner : `(${inner})`
}

/** Client-side mirror of the backend tree limits. */
export function validateTree(tree: ConditionTree): string | null {
  let error: string | null = null
  const visit = (node: ConditionNode, depth: number) => {
    if (error || node.type === 'condition') return
    if (depth > MAX_TREE_DEPTH) {
      error = `Blocks can be nested at most ${MAX_TREE_DEPTH} levels deep`
      return
    }
    if (node.children.length === 0) {
      error = 'Every block needs at least one entry'
      return
    }
    for (const child of node.children) visit(child, depth + 1)
  }
  visit(tree, 1)
  if (error) return error
  if (treeLeaves(tree).length > MAX_CONDITIONS) {
    return `At most ${MAX_CONDITIONS} conditions are allowed`
  }
  return null
}

export function sortRulesByPriority(rules: TargetingRule[]): TargetingRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority)
}

/** Priority for a newly created rule: one after the current maximum. */
export function nextPriority(rules: Pick<TargetingRule, 'priority'>[]): number {
  if (rules.length === 0) return 0
  return Math.max(...rules.map((r) => r.priority)) + 1
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO timestamp → value of an `<input type="datetime-local">` (local time). */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `datetime-local` value (local time) → ISO timestamp, '' → null. */
export function fromLocalInputValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

/** Client-side mirror of the backend check: a window must end after it starts. */
export function validateWindow(
  activeFrom: string | null,
  activeUntil: string | null
): string | null {
  if (activeFrom && activeUntil && activeFrom >= activeUntil) {
    return '"Active from" must be before "Active until"'
  }
  return null
}

export type RuleScheduleStatus = {
  kind: 'scheduled' | 'active-until' | 'expired'
  /** ISO timestamp the status refers to. */
  at: string
}

/**
 * Status of a rule's time window for the rule list (window is
 * activeFrom <= now < activeUntil); null when nothing is worth showing.
 */
export function ruleScheduleStatus(
  rule: Pick<TargetingRule, 'activeFrom' | 'activeUntil'>,
  now: Date = new Date()
): RuleScheduleStatus | null {
  const { activeFrom, activeUntil } = rule
  if (activeUntil && now >= new Date(activeUntil)) {
    return { kind: 'expired', at: activeUntil }
  }
  if (activeFrom && now < new Date(activeFrom)) {
    return { kind: 'scheduled', at: activeFrom }
  }
  if (activeUntil) return { kind: 'active-until', at: activeUntil }
  return null
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
  input: Omit<CreateTargetingRuleInput, 'priority'>
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
