import { ConditionOperator, RuleOperator } from '@prisma/client'
import { groupConditions } from './condition-groups'

/** A single comparison against the evaluation context. */
export interface ConditionLeaf {
  type: 'condition'
  attribute: string
  operator: ConditionOperator
  value: string
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
export type ConditionTree = ConditionBlock & { type: 'AND' | 'OR' }

export const TREE_MAX_DEPTH = 5
export const TREE_MAX_CONDITIONS = 20
const ATTRIBUTE_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/
const VALUE_MAX_LENGTH = 1000
const CONDITION_OPERATORS = new Set<string>(Object.values(ConditionOperator))

export class ConditionTreeError extends Error {}

export function evaluateTree(
  node: ConditionNode,
  matchLeaf: (leaf: ConditionLeaf) => boolean
): boolean {
  if (node.type === 'condition') return matchLeaf(node)
  const matches = (child: ConditionNode) => evaluateTree(child, matchLeaf)
  if (node.type === 'AND') return node.children.every(matches)
  if (node.type === 'OR') return node.children.some(matches)
  return !node.children.some(matches)
}

/** All conditions of a tree, depth-first. */
export function treeLeaves(node: ConditionNode): ConditionLeaf[] {
  if (node.type === 'condition') return [node]
  return node.children.flatMap(treeLeaves)
}

const toLeaf = (c: {
  attribute: string
  operator: ConditionOperator
  value: string
}): ConditionLeaf => ({
  type: 'condition',
  attribute: c.attribute,
  operator: c.operator,
  value: c.value,
})

/**
 * The rule's condition tree. Rules saved before trees existed keep their
 * conditions in RuleCondition rows (optionally grouped); they are read as
 * the equivalent tree: one group becomes the root, several groups become
 * blocks under the rule operator (single-condition groups stay leaves).
 */
export function ruleTree(rule: {
  operator: RuleOperator
  groupOperators?: RuleOperator[] | null
  conditionTree?: unknown
  conditions: {
    attribute: string
    operator: ConditionOperator
    value: string
    groupIndex?: number | null
  }[]
}): ConditionTree {
  if (rule.conditionTree) return rule.conditionTree as ConditionTree
  const groups = groupConditions(rule)
  if (groups.length === 0) return { type: 'AND', children: [] }
  if (groups.length === 1) {
    return {
      type: groups[0].operator,
      children: groups[0].conditions.map(toLeaf),
    }
  }
  return {
    type: rule.operator,
    children: groups.map((group) =>
      group.conditions.length === 1
        ? toLeaf(group.conditions[0])
        : { type: group.operator, children: group.conditions.map(toLeaf) }
    ),
  }
}

/**
 * Validates untrusted input and rebuilds it with known fields only.
 * Throws ConditionTreeError with a message for the API client.
 */
export function parseConditionTree(input: unknown): ConditionTree {
  let leaves = 0

  const parse = (node: unknown, depth: number, path: string): ConditionNode => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new ConditionTreeError(`${path}: must be an object`)
    }
    const { type } = node as { type?: unknown }

    if (type === 'condition') {
      const { attribute, operator, value } = node as Record<string, unknown>
      if (typeof attribute !== 'string' || !ATTRIBUTE_PATTERN.test(attribute)) {
        throw new ConditionTreeError(
          `${path}: attribute may only contain letters, digits, "_", "." and "-" (max 100)`
        )
      }
      if (typeof operator !== 'string' || !CONDITION_OPERATORS.has(operator)) {
        throw new ConditionTreeError(`${path}: unknown operator`)
      }
      if (typeof value !== 'string' || value.length > VALUE_MAX_LENGTH) {
        throw new ConditionTreeError(
          `${path}: value must be a string of at most ${VALUE_MAX_LENGTH} characters`
        )
      }
      if (++leaves > TREE_MAX_CONDITIONS) {
        throw new ConditionTreeError(
          `At most ${TREE_MAX_CONDITIONS} conditions are allowed`
        )
      }
      return {
        type: 'condition',
        attribute,
        operator: operator as ConditionOperator,
        value,
      }
    }

    if (type !== 'AND' && type !== 'OR' && type !== 'NOT') {
      throw new ConditionTreeError(`${path}: unknown node type`)
    }
    if (depth > TREE_MAX_DEPTH) {
      throw new ConditionTreeError(
        `Blocks can be nested at most ${TREE_MAX_DEPTH} levels deep`
      )
    }
    const { children } = node as { children?: unknown }
    if (!Array.isArray(children) || children.length === 0) {
      throw new ConditionTreeError(`${path}: a block needs at least one entry`)
    }
    return {
      type,
      children: children.map((child, i) =>
        parse(child, depth + 1, `${path}.children[${i}]`)
      ),
    }
  }

  const type = (input as { type?: unknown } | null)?.type
  if (type !== 'AND' && type !== 'OR') {
    throw new ConditionTreeError('conditionTree: the root must be AND or OR')
  }
  return parse(input, 1, 'conditionTree') as ConditionTree
}
