import { describe, expect, it } from 'vitest'
import {
  formatCondition,
  formatConditions,
  nextPriority,
  sortRulesByPriority,
  type TargetingRule,
  validateRuleInput,
  validateServeValue,
} from './targeting-rules'

const rule = (id: string, priority: number): TargetingRule => ({
  id,
  environmentId: 'env',
  brandId: null,
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
