import { describe, expect, it } from 'vitest'
import {
  type ConditionNode,
  type ConditionTree,
  formatCondition,
  formatConditions,
  formatTree,
  fromLocalInputValue,
  hasNestedBlocks,
  nextPriority,
  normalizeConditionValue,
  ruleScheduleStatus,
  ruleTree,
  sortRulesByPriority,
  type TargetingRule,
  toLocalInputValue,
  treeLeaves,
  validateRuleInput,
  validateServeValue,
  validateTree,
  validateWindow,
} from './targeting-rules'

const rule = (id: string, priority: number): TargetingRule => ({
  id,
  environmentIds: ['env'],
  brandIds: [],
  name: null,
  operator: 'AND',
  serveValue: 'true',
  priority,
  isDefault: false,
  enabled: true,
  conditions: [],
  createdAt: '',
  updatedAt: '',
})

describe('targeting-rules helpers', () => {
  it('formats a single condition', () => {
    expect(
      formatCondition({ attribute: 'country', operator: 'EQUALS', value: 'DE' })
    ).toBe('country EQUALS DE')
  })

  it('joins conditions with the match operator', () => {
    expect(
      formatConditions(
        [
          { attribute: 'country', operator: 'EQUALS', value: 'DE' },
          { attribute: 'plan', operator: 'IN', value: 'pro,team' },
        ],
        'OR'
      )
    ).toBe('country EQUALS DE OR plan IN pro,team')
  })

  it('sorts rules by priority without mutating the input', () => {
    const rules = [rule('b', 2), rule('a', 0), rule('c', 1)]
    expect(sortRulesByPriority(rules).map((r) => r.id)).toEqual(['a', 'c', 'b'])
    expect(rules[0].id).toBe('b')
  })

  it('computes the next priority', () => {
    expect(nextPriority([])).toBe(0)
    expect(nextPriority([rule('a', 3), rule('b', 7)])).toBe(8)
  })

  it('validates serve values per flag type', () => {
    expect(validateServeValue('BOOLEAN', 'true')).toBeNull()
    expect(validateServeValue('BOOLEAN', 'false')).toBeNull()
    expect(validateServeValue('BOOLEAN', 'yes')).not.toBeNull()
    expect(validateServeValue('NUMBER', '42.5')).toBeNull()
    expect(validateServeValue('NUMBER', 'abc')).not.toBeNull()
    expect(validateServeValue('NUMBER', '')).not.toBeNull()
    expect(validateServeValue('JSON', '{"a":1}')).toBeNull()
    expect(validateServeValue('JSON', '{a:1}')).not.toBeNull()
    expect(validateServeValue('STRING', 'anything')).toBeNull()
  })

  it('validates rule input', () => {
    const base = {
      operator: 'AND' as const,
      serveValue: 'true',
      conditions: [
        { attribute: 'country', operator: 'EQUALS' as const, value: 'DE' },
      ],
    }
    expect(validateRuleInput('BOOLEAN', base)).toBeNull()
    expect(
      validateRuleInput('BOOLEAN', { ...base, conditions: [] })
    ).not.toBeNull()
    expect(
      validateRuleInput('BOOLEAN', {
        ...base,
        conditions: [
          { attribute: 'bad attr!', operator: 'EQUALS', value: 'x' },
        ],
      })
    ).toMatch(/attribute/)
    expect(
      validateRuleInput('BOOLEAN', {
        ...base,
        conditions: [
          { attribute: 'a', operator: 'EQUALS', value: 'x'.repeat(1001) },
        ],
      })
    ).toMatch(/value/)
    expect(
      validateRuleInput('BOOLEAN', { ...base, name: 'n'.repeat(201) })
    ).toMatch(/name/)
    expect(validateRuleInput('BOOLEAN', { ...base, serveValue: '1' })).toMatch(
      /true or false/
    )
  })
})

describe('normalizeConditionValue', () => {
  it('trims list entries and drops empty ones for IN / NOT_IN', () => {
    expect(normalizeConditionValue('IN', ' DE, AT ,,CH ')).toBe('DE,AT,CH')
    expect(normalizeConditionValue('NOT_IN', 'x, ')).toBe('x')
  })

  it('keeps other values unchanged', () => {
    expect(normalizeConditionValue('EQUALS', ' DE ')).toBe(' DE ')
  })
})

describe('datetime-local conversion', () => {
  it('round-trips a local input value through ISO', () => {
    const iso = fromLocalInputValue('2026-11-27T08:30')
    expect(iso).toBe(new Date(2026, 10, 27, 8, 30).toISOString())
    expect(toLocalInputValue(iso)).toBe('2026-11-27T08:30')
  })

  it('maps empty values to null and back', () => {
    expect(fromLocalInputValue('')).toBeNull()
    expect(toLocalInputValue(null)).toBe('')
    expect(toLocalInputValue(undefined)).toBe('')
  })
})

describe('validateWindow', () => {
  it('accepts open or ordered windows', () => {
    expect(validateWindow(null, null)).toBeNull()
    expect(validateWindow('2026-11-27T00:00:00.000Z', null)).toBeNull()
    expect(
      validateWindow('2026-11-27T00:00:00.000Z', '2026-11-30T00:00:00.000Z')
    ).toBeNull()
  })

  it('rejects windows that end before they start', () => {
    expect(
      validateWindow('2026-11-30T00:00:00.000Z', '2026-11-27T00:00:00.000Z')
    ).toMatch(/before/)
    expect(
      validateWindow('2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z')
    ).toMatch(/before/)
  })
})

describe('ruleScheduleStatus', () => {
  const now = new Date('2026-11-28T12:00:00.000Z')
  const FROM = '2026-11-27T00:00:00.000Z'
  const UNTIL = '2026-11-30T00:00:00.000Z'

  it('is null without a window', () => {
    expect(ruleScheduleStatus({}, now)).toBeNull()
    expect(ruleScheduleStatus({ activeFrom: FROM }, now)).toBeNull()
  })

  it('reports a window that has not started yet', () => {
    expect(
      ruleScheduleStatus({ activeFrom: '2026-12-01T00:00:00.000Z' }, now)
    ).toEqual({ kind: 'scheduled', at: '2026-12-01T00:00:00.000Z' })
  })

  it('reports the end of a running window', () => {
    expect(
      ruleScheduleStatus({ activeFrom: FROM, activeUntil: UNTIL }, now)
    ).toEqual({ kind: 'active-until', at: UNTIL })
  })

  it('reports an expired window', () => {
    expect(
      ruleScheduleStatus({ activeUntil: '2026-11-28T12:00:00.000Z' }, now)
    ).toEqual({ kind: 'expired', at: '2026-11-28T12:00:00.000Z' })
  })
})

describe('condition tree', () => {
  const c = (attribute: string, value: string) => ({
    attribute,
    operator: 'EQUALS' as const,
    value,
  })
  const leaf = (attribute: string, value: string) => ({
    type: 'condition' as const,
    ...c(attribute, value),
  })
  // country = DE AND (plan = pro OR NOT (beta = no OR email = x))
  const tree = {
    type: 'AND' as const,
    children: [
      leaf('country', 'DE'),
      {
        type: 'OR' as const,
        children: [
          leaf('plan', 'pro'),
          {
            type: 'NOT' as const,
            children: [leaf('beta', 'no'), leaf('email', 'x')],
          },
        ],
      },
    ],
  }

  it('uses the tree of the API response', () => {
    expect(
      ruleTree({ operator: 'AND', conditions: [], conditionTree: tree })
    ).toBe(tree)
  })

  it('builds a tree for older API versions', () => {
    expect(
      ruleTree({ operator: 'OR', conditions: [{ id: '1', ...c('a', '1') }] })
    ).toEqual({ type: 'OR', children: [leaf('a', '1')] })
    expect(
      ruleTree({
        operator: 'OR',
        conditions: [],
        groups: [
          { operator: 'AND', conditions: [{ id: '1', ...c('a', '1') }] },
          {
            operator: 'AND',
            conditions: [
              { id: '2', ...c('b', '2') },
              { id: '3', ...c('c', '3') },
            ],
          },
        ],
      })
    ).toEqual({
      type: 'OR',
      children: [
        leaf('a', '1'),
        { type: 'AND', children: [leaf('b', '2'), leaf('c', '3')] },
      ],
    })
    expect(ruleTree({ operator: 'OR', conditions: [] })).toEqual({
      type: 'AND',
      children: [],
    })
  })

  it('formats blocks with parentheses and NOT', () => {
    expect(formatTree(tree)).toBe(
      'country EQUALS DE AND (plan EQUALS pro OR NOT (beta EQUALS no OR email EQUALS x))'
    )
  })

  it('lists leaves depth-first and detects nesting', () => {
    expect(treeLeaves(tree).map((l) => l.attribute)).toEqual([
      'country',
      'plan',
      'beta',
      'email',
    ])
    expect(hasNestedBlocks(tree)).toBe(true)
    expect(hasNestedBlocks({ type: 'OR', children: [leaf('a', '1')] })).toBe(
      false
    )
  })

  it('validates empty blocks, depth and the condition limit', () => {
    expect(validateTree(tree)).toBeNull()
    expect(
      validateTree({ type: 'AND', children: [{ type: 'NOT', children: [] }] })
    ).toMatch(/at least one entry/)
    const deep = (depth: number): ConditionNode =>
      depth === 0
        ? leaf('a', '1')
        : { type: 'AND', children: [deep(depth - 1)] }
    expect(validateTree(deep(5) as ConditionTree)).toBeNull()
    expect(validateTree(deep(6) as ConditionTree)).toMatch(/5 levels/)
    expect(
      validateTree({
        type: 'AND',
        children: Array.from({ length: 21 }, () => leaf('a', '1')),
      })
    ).toMatch(/20 conditions/)
  })
})
