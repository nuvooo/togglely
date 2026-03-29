import { EvaluationService, TargetingRuleWithConditions, ToggleContext } from './evaluation.service'

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
          { country: 'DE' },
        ),
      ).toBe(true)
    })

    it('should not match EQUALS when values differ', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          { country: 'US' },
        ),
      ).toBe(false)
    })

    it('should match NOT_EQUALS operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'NOT_EQUALS', value: 'DE' },
          { country: 'US' },
        ),
      ).toBe(true)
    })

    it('should match NOT_EQUALS when attribute is missing', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'NOT_EQUALS', value: 'DE' },
          {},
        ),
      ).toBe(true)
    })

    it('should match CONTAINS operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'email', operator: 'CONTAINS', value: '@company.com' },
          { email: 'user@company.com' },
        ),
      ).toBe(true)
    })

    it('should not match CONTAINS when substring missing', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'email', operator: 'CONTAINS', value: '@company.com' },
          { email: 'user@other.com' },
        ),
      ).toBe(false)
    })

    it('should match NOT_CONTAINS operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'email', operator: 'NOT_CONTAINS', value: '@company.com' },
          { email: 'user@other.com' },
        ),
      ).toBe(true)
    })

    it('should match NOT_CONTAINS when attribute is missing', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'email', operator: 'NOT_CONTAINS', value: '@company.com' },
          {},
        ),
      ).toBe(true)
    })

    it('should match STARTS_WITH operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'email', operator: 'STARTS_WITH', value: 'admin' },
          { email: 'admin@example.com' },
        ),
      ).toBe(true)
    })

    it('should match ENDS_WITH operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'email', operator: 'ENDS_WITH', value: '.com' },
          { email: 'user@example.com' },
        ),
      ).toBe(true)
    })

    it('should match GREATER_THAN operator with numbers', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'age', operator: 'GREATER_THAN', value: '18' },
          { age: '25' },
        ),
      ).toBe(true)
    })

    it('should not match GREATER_THAN when equal', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'age', operator: 'GREATER_THAN', value: '18' },
          { age: '18' },
        ),
      ).toBe(false)
    })

    it('should return false for GREATER_THAN with non-numeric values', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'name', operator: 'GREATER_THAN', value: '18' },
          { name: 'abc' },
        ),
      ).toBe(false)
    })

    it('should match LESS_THAN operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'age', operator: 'LESS_THAN', value: '18' },
          { age: '15' },
        ),
      ).toBe(true)
    })

    it('should match IN operator with comma-separated values', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'IN', value: 'DE, US, GB' },
          { country: 'US' },
        ),
      ).toBe(true)
    })

    it('should match IN operator with JSON array', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'IN', value: '["DE","US","GB"]' },
          { country: 'US' },
        ),
      ).toBe(true)
    })

    it('should not match IN when value not in list', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'IN', value: 'DE, US, GB' },
          { country: 'FR' },
        ),
      ).toBe(false)
    })

    it('should match NOT_IN operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'NOT_IN', value: 'DE, US' },
          { country: 'FR' },
        ),
      ).toBe(true)
    })

    it('should match NOT_IN when attribute is missing', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'NOT_IN', value: 'DE, US' },
          {},
        ),
      ).toBe(true)
    })

    it('should match MATCHES_REGEX operator', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'email', operator: 'MATCHES_REGEX', value: '^[a-z]+@company\\.com$' },
          { email: 'admin@company.com' },
        ),
      ).toBe(true)
    })

    it('should return false for invalid regex', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'email', operator: 'MATCHES_REGEX', value: '[invalid(' },
          { email: 'test@test.com' },
        ),
      ).toBe(false)
    })

    it('should not match when attribute is missing (for non-negation operators)', () => {
      expect(
        service.matchesCondition(
          { id: '1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
          {},
        ),
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
          { id: 'c2', attribute: 'email', operator: 'CONTAINS', value: '@company.com' },
        ],
      }

      expect(
        service.matchesRule(rule, { country: 'DE', email: 'user@company.com' }),
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
          { id: 'c2', attribute: 'email', operator: 'CONTAINS', value: '@company.com' },
        ],
      }

      expect(
        service.matchesRule(rule, { country: 'DE', email: 'user@other.com' }),
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

  describe('evaluateRules', () => {
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

      expect(service.evaluateRules(rules, { country: 'FR' })).toBe('default_value')
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
