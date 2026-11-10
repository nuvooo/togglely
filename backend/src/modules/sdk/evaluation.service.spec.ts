import {
  EvaluationService,
  TargetingRuleWithConditions,
  ToggleContext,
} from './evaluation.service'

describe('EvaluationService', () => {
  let service: EvaluationService

  beforeEach(() => {
    service = new EvaluationService()
  })

  describe('matchesCondition', () => {
    it('should match EQUALS operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          { country: 'DE' }
        )
      ).toBe(true)
    })

    it('should not match EQUALS when values differ', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          { country: 'US' }
        )
      ).toBe(false)
    })

    it('should match NOT_EQUALS operator', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'country',
            operator: 'NOT_EQUALS',
            value: 'DE',
          },
          { country: 'US' }
        )
      ).toBe(true)
    })

    it('should match NOT_EQUALS when attribute is missing', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'country',
            operator: 'NOT_EQUALS',
            value: 'DE',
          },
          {}
        )
      ).toBe(true)
    })

    it('should match CONTAINS operator', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'email',
            operator: 'CONTAINS',
            value: '@company.com',
          },
          { email: 'user@company.com' }
        )
      ).toBe(true)
    })

    it('should not match CONTAINS when substring missing', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'email',
            operator: 'CONTAINS',
            value: '@company.com',
          },
          { email: 'user@other.com' }
        )
      ).toBe(false)
    })

    it('should match NOT_CONTAINS operator', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'email',
            operator: 'NOT_CONTAINS',
            value: '@company.com',
          },
          { email: 'user@other.com' }
        )
      ).toBe(true)
    })

    it('should match NOT_CONTAINS when attribute is missing', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'email',
            operator: 'NOT_CONTAINS',
            value: '@company.com',
          },
          {}
        )
      ).toBe(true)
    })

    it('should match STARTS_WITH operator', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'email',
            operator: 'STARTS_WITH',
            value: 'admin',
          },
          { email: 'admin@example.com' }
        )
      ).toBe(true)
    })

    it('should match ENDS_WITH operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'email', operator: 'ENDS_WITH', value: '.com' },
          { email: 'user@example.com' }
        )
      ).toBe(true)
    })

    it('should match GREATER_THAN operator with numbers', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'age', operator: 'GREATER_THAN', value: '18' },
          { age: '25' }
        )
      ).toBe(true)
    })

    it('should not match GREATER_THAN when equal', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'age', operator: 'GREATER_THAN', value: '18' },
          { age: '18' }
        )
      ).toBe(false)
    })

    it('should return false for GREATER_THAN with non-numeric values', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'name', operator: 'GREATER_THAN', value: '18' },
          { name: 'abc' }
        )
      ).toBe(false)
    })

    it('should match LESS_THAN operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'age', operator: 'LESS_THAN', value: '18' },
          { age: '15' }
        )
      ).toBe(true)
    })

    it('should match IN operator with comma-separated values', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'country',
            operator: 'IN',
            value: 'DE, US, GB',
          },
          { country: 'US' }
        )
      ).toBe(true)
    })

    it('should match IN operator with JSON array', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'country',
            operator: 'IN',
            value: '["DE","US","GB"]',
          },
          { country: 'US' }
        )
      ).toBe(true)
    })

    it('should not match IN when value not in list', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'country',
            operator: 'IN',
            value: 'DE, US, GB',
          },
          { country: 'FR' }
        )
      ).toBe(false)
    })

    it('should match NOT_IN operator', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'country',
            operator: 'NOT_IN',
            value: 'DE, US',
          },
          { country: 'FR' }
        )
      ).toBe(true)
    })

    it('should match NOT_IN when attribute is missing', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'country',
            operator: 'NOT_IN',
            value: 'DE, US',
          },
          {}
        )
      ).toBe(true)
    })

    it('should match MATCHES_REGEX operator', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'email',
            operator: 'MATCHES_REGEX',
            value: '^[a-z]+@company\\.com$',
          },
          { email: 'admin@company.com' }
        )
      ).toBe(true)
    })

    it('should return false for invalid regex', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'email',
            operator: 'MATCHES_REGEX',
            value: '[invalid(',
          },
          { email: 'test@test.com' }
        )
      ).toBe(false)
    })

    it('should reject regex patterns with nested quantifiers (ReDoS)', () => {
      const started = Date.now()
      for (const value of [
        '(a+)+$',
        '(a*)*b',
        '(\\w+){2,}x',
        '(a|aa+)+$',
        '(.*a){20}',
      ]) {
        expect(
          service.matchesCondition(
            { id: '1', attribute: 'name', operator: 'MATCHES_REGEX', value },
            { name: `${'a'.repeat(40)}!` }
          )
        ).toBe(false)
      }
      expect(Date.now() - started).toBeLessThan(1000)
    })

    it('should reject overly long regex patterns and inputs', () => {
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'name',
            operator: 'MATCHES_REGEX',
            value: 'a'.repeat(257),
          },
          { name: 'a'.repeat(257) }
        )
      ).toBe(false)
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'name',
            operator: 'MATCHES_REGEX',
            value: '^a+$',
          },
          { name: 'a'.repeat(1025) }
        )
      ).toBe(false)
      expect(
        service.matchesCondition(
          {
            id: '1',
            attribute: 'name',
            operator: 'MATCHES_REGEX',
            value: '^a+$',
          },
          { name: 'a'.repeat(1024) }
        )
      ).toBe(true)
    })

    it('should ignore prototype keys and inherited properties as attributes', () => {
      for (const attribute of [
        '__proto__',
        'constructor',
        'prototype',
        'toString',
      ]) {
        expect(
          service.matchesCondition(
            { id: '1', attribute, operator: 'CONTAINS', value: 'Object' },
            {}
          )
        ).toBe(false)
        expect(
          service.matchesCondition(
            { id: '1', attribute, operator: 'MATCHES_REGEX', value: '.' },
            {}
          )
        ).toBe(false)
      }
    })

    it('should not match when attribute is missing (for non-negation operators)', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          {}
        )
      ).toBe(false)
    })
  })

  describe('matchesRule', () => {
    it('should match AND rule when all conditions match', () => {
      const rule: TargetingRuleWithConditions = {
        id: '1',
        name: 'Test Rule',
        operator: 'AND',
        serveValue: 'true',
        isDefault: false,
        priority: 1,
        conditions: [
          { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          {
            id: 'c2',
            attribute: 'email',
            operator: 'CONTAINS',
            value: '@company.com',
          },
        ],
      }

      expect(
        service.matchesRule(rule, { country: 'DE', email: 'user@company.com' })
      ).toBe(true)
    })

    it('should not match AND rule when one condition fails', () => {
      const rule: TargetingRuleWithConditions = {
        id: '1',
        name: 'Test Rule',
        operator: 'AND',
        serveValue: 'true',
        isDefault: false,
        priority: 1,
        conditions: [
          { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          {
            id: 'c2',
            attribute: 'email',
            operator: 'CONTAINS',
            value: '@company.com',
          },
        ],
      }

      expect(
        service.matchesRule(rule, { country: 'DE', email: 'user@other.com' })
      ).toBe(false)
    })

    it('should match OR rule when at least one condition matches', () => {
      const rule: TargetingRuleWithConditions = {
        id: '1',
        name: 'Test Rule',
        operator: 'OR',
        serveValue: 'true',
        isDefault: false,
        priority: 1,
        conditions: [
          { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          { id: 'c2', attribute: 'country', operator: 'EQUALS', value: 'US' },
        ],
      }

      expect(service.matchesRule(rule, { country: 'US' })).toBe(true)
    })

    it('should not match OR rule when no conditions match', () => {
      const rule: TargetingRuleWithConditions = {
        id: '1',
        name: 'Test Rule',
        operator: 'OR',
        serveValue: 'true',
        isDefault: false,
        priority: 1,
        conditions: [
          { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          { id: 'c2', attribute: 'country', operator: 'EQUALS', value: 'US' },
        ],
      }

      expect(service.matchesRule(rule, { country: 'FR' })).toBe(false)
    })

    it('should match rule with no conditions', () => {
      const rule: TargetingRuleWithConditions = {
        id: '1',
        name: 'Empty Rule',
        operator: 'AND',
        serveValue: 'true',
        isDefault: false,
        priority: 1,
        conditions: [],
      }

      expect(service.matchesRule(rule, {})).toBe(true)
    })
  })

  describe('condition groups', () => {
    const c = (attribute: string, value: string, groupIndex: number) => ({
      id: attribute + groupIndex,
      attribute,
      operator: 'EQUALS' as const,
      value,
      groupIndex,
    })
    const groupedRule = (
      operator: 'AND' | 'OR',
      groupOperators: ('AND' | 'OR')[],
      conditions: ReturnType<typeof c>[]
    ): TargetingRuleWithConditions => ({
      id: 'g',
      name: 'grouped',
      operator,
      groupOperators,
      serveValue: 'on',
      isDefault: false,
      priority: 0,
      conditions,
    })

    // country = DE AND (plan = pro OR beta = yes)
    const deAndProOrBeta = groupedRule(
      'AND',
      ['AND', 'OR'],
      [c('country', 'DE', 0), c('plan', 'pro', 1), c('beta', 'yes', 1)]
    )

    it.each([
      [{ country: 'DE', plan: 'pro' }, true],
      [{ country: 'DE', beta: 'yes' }, true],
      [{ country: 'DE', plan: 'free' }, false],
      [{ country: 'AT', plan: 'pro', beta: 'yes' }, false],
    ])('A AND (B OR C) with %j -> %s', (context, expected) => {
      expect(service.matchesRule(deAndProOrBeta, context)).toBe(expected)
    })

    // (country = DE AND plan = pro) OR (country = AT AND beta = yes)
    const eitherPair = groupedRule(
      'OR',
      ['AND', 'AND'],
      [
        c('country', 'DE', 0),
        c('plan', 'pro', 0),
        c('country', 'AT', 1),
        c('beta', 'yes', 1),
      ]
    )

    it.each([
      [{ country: 'DE', plan: 'pro' }, true],
      [{ country: 'AT', beta: 'yes' }, true],
      [{ country: 'DE', beta: 'yes' }, false],
      [{ country: 'AT', plan: 'pro' }, false],
    ])('(A AND B) OR (C AND D) with %j -> %s', (context, expected) => {
      expect(service.matchesRule(eitherPair, context)).toBe(expected)
    })

    it('keeps rules without groups as one group with the rule operator', () => {
      const legacy = groupedRule(
        'OR',
        [],
        [c('country', 'DE', 0), c('country', 'AT', 0)]
      )
      expect(service.matchesRule(legacy, { country: 'AT' })).toBe(true)
      expect(service.matchesRule(legacy, { country: 'CH' })).toBe(false)
    })
  })

  describe('evaluateRules', () => {
    describe('time windows', () => {
      const NOW = new Date('2026-11-28T12:00:00.000Z')
      const windowRule = (
        serveValue: string,
        priority: number,
        window: { activeFrom?: Date | null; activeUntil?: Date | null }
      ): TargetingRuleWithConditions => ({
        id: serveValue,
        name: serveValue,
        operator: 'AND',
        serveValue,
        isDefault: false,
        priority,
        conditions: [],
        ...window,
      })

      it('skips rules that have not started yet', () => {
        const rules = [
          windowRule('future', 0, {
            activeFrom: new Date('2026-12-01T00:00:00.000Z'),
          }),
          windowRule('always', 1, {}),
        ]
        expect(service.evaluateRules(rules, {}, NOW)).toBe('always')
      })

      it('skips expired rules', () => {
        const rules = [
          windowRule('expired', 0, {
            activeUntil: new Date('2026-11-28T12:00:00.000Z'),
          }),
          windowRule('always', 1, {}),
        ]
        expect(service.evaluateRules(rules, {}, NOW)).toBe('always')
      })

      it('applies rules inside their window', () => {
        const rules = [
          windowRule('black-friday', 0, {
            activeFrom: new Date('2026-11-27T00:00:00.000Z'),
            activeUntil: new Date('2026-11-30T00:00:00.000Z'),
          }),
          windowRule('always', 1, {}),
        ]
        expect(service.evaluateRules(rules, {}, NOW)).toBe('black-friday')
      })

      it('skips a default rule outside its window', () => {
        const rules = [
          {
            ...windowRule('default', 0, {
              activeUntil: new Date('2026-11-01T00:00:00.000Z'),
            }),
            isDefault: true,
          },
        ]
        expect(service.evaluateRules(rules, {}, NOW)).toBeNull()
      })
    })

    it('should return null for empty rules', () => {
      expect(service.evaluateRules([], {})).toBeNull()
    })

    it('should return first matching rule by priority', () => {
      const rules: TargetingRuleWithConditions[] = [
        {
          id: '2',
          name: 'Low priority',
          operator: 'AND',
          serveValue: 'low',
          isDefault: false,
          priority: 10,
          conditions: [
            { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          ],
        },
        {
          id: '1',
          name: 'High priority',
          operator: 'AND',
          serveValue: 'high',
          isDefault: false,
          priority: 1,
          conditions: [
            { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          ],
        },
      ]

      expect(service.evaluateRules(rules, { country: 'DE' })).toBe('high')
    })

    it('should skip non-matching rules', () => {
      const rules: TargetingRuleWithConditions[] = [
        {
          id: '1',
          name: 'DE only',
          operator: 'AND',
          serveValue: 'de_value',
          isDefault: false,
          priority: 1,
          conditions: [
            { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          ],
        },
        {
          id: '2',
          name: 'US only',
          operator: 'AND',
          serveValue: 'us_value',
          isDefault: false,
          priority: 2,
          conditions: [
            { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'US' },
          ],
        },
      ]

      expect(service.evaluateRules(rules, { country: 'US' })).toBe('us_value')
    })

    it('should fall back to default rule when no non-default rules match', () => {
      const rules: TargetingRuleWithConditions[] = [
        {
          id: '1',
          name: 'DE only',
          operator: 'AND',
          serveValue: 'de_value',
          isDefault: false,
          priority: 1,
          conditions: [
            { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          ],
        },
        {
          id: '2',
          name: 'Default',
          operator: 'AND',
          serveValue: 'default_value',
          isDefault: true,
          priority: 100,
          conditions: [],
        },
      ]

      expect(service.evaluateRules(rules, { country: 'FR' })).toBe(
        'default_value'
      )
    })

    it('should return null when no rules match and no default exists', () => {
      const rules: TargetingRuleWithConditions[] = [
        {
          id: '1',
          name: 'DE only',
          operator: 'AND',
          serveValue: 'de_value',
          isDefault: false,
          priority: 1,
          conditions: [
            { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          ],
        },
      ]

      expect(service.evaluateRules(rules, { country: 'FR' })).toBeNull()
    })

    it('should prefer non-default match over default rule', () => {
      const rules: TargetingRuleWithConditions[] = [
        {
          id: '1',
          name: 'DE only',
          operator: 'AND',
          serveValue: 'de_value',
          isDefault: false,
          priority: 1,
          conditions: [
            { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          ],
        },
        {
          id: '2',
          name: 'Default',
          operator: 'AND',
          serveValue: 'default_value',
          isDefault: true,
          priority: 0,
          conditions: [],
        },
      ]

      expect(service.evaluateRules(rules, { country: 'DE' })).toBe('de_value')
    })
  })
})

describe('EvaluationService disabled rules', () => {
  const { EvaluationService } = require('./evaluation.service')
  const service = new EvaluationService()
  const rule = (overrides: Record<string, unknown>) => ({
    id: 'r',
    name: 'r',
    operator: 'AND',
    serveValue: 'on',
    isDefault: false,
    priority: 0,
    conditions: [{ id: 'c', attribute: 'country', operator: 'EQUALS', value: 'DE' }],
    ...overrides,
  })

  it('skips disabled rules and falls through to the next one', () => {
    expect(
      service.evaluateRules(
        [
          rule({ id: 'a', enabled: false, serveValue: 'disabled' }),
          rule({ id: 'b', priority: 1, serveValue: 'active' }),
        ],
        { country: 'DE' }
      )
    ).toBe('active')
  })

  it('ignores a disabled default rule', () => {
    expect(
      service.evaluateRules(
        [rule({ isDefault: true, enabled: false, conditions: [] })],
        {}
      )
    ).toBeNull()
  })
})
