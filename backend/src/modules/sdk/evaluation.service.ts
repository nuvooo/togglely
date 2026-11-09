import { Injectable, Logger } from '@nestjs/common'
import { ConditionOperator, RuleOperator } from '@prisma/client'

export interface ToggleContext {
  userId?: string
  email?: string
  country?: string
  region?: string
  [key: string]: unknown
}

export interface TargetingRuleWithConditions {
  id: string
  name: string | null
  operator: RuleOperator
  serveValue: string
  isDefault: boolean
  enabled?: boolean
  priority: number
  conditions: RuleConditionData[]
}

export interface RuleConditionData {
  id: string
  attribute: string
  operator: ConditionOperator
  value: string
}

export interface EvaluationResult {
  value: string
  reason: 'DISABLED' | 'EXPERIMENT' | 'TARGETING_RULE' | 'DEFAULT'
  ruleName?: string | null
  experimentKey?: string
  variantKey?: string
}

export const MAX_REGEX_PATTERN_LENGTH = 256
export const MAX_REGEX_INPUT_LENGTH = 1024

/**
 * Heuristic for nested quantifiers: a group containing a quantifier that is
 * itself quantified, e.g. "(a+)+", "(a*)*", "(\w+){2,}", "(a|a+)*".
 */
const NESTED_QUANTIFIER_PATTERN = /\([^)]*[+*}][^)]*\)\s*[+*{]/

/**
 * Returns true if a tenant-defined regex pattern passes the ReDoS safety
 * limits and compiles. Used both when saving rules and when evaluating.
 */
export function isRegexPatternAllowed(pattern: unknown): pattern is string {
  if (
    typeof pattern !== 'string' ||
    pattern.length === 0 ||
    pattern.length > MAX_REGEX_PATTERN_LENGTH ||
    NESTED_QUANTIFIER_PATTERN.test(pattern)
  ) {
    return false
  }
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

const FORBIDDEN_ATTRIBUTE_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name)

  /**
   * Evaluate targeting rules against a user context.
   * Rules are evaluated in priority order (lowest number = highest priority).
   * The first matching rule wins and its serveValue is returned.
   * Default rules (isDefault=true) are evaluated last as fallback.
   */
  evaluateRules(
    rules: TargetingRuleWithConditions[],
    context: ToggleContext
  ): string | null {
    if (rules.length === 0) {
      return null
    }

    // Sort by priority (lowest number = highest priority); skip disabled rules
    const sorted = rules
      .filter((r) => r.enabled !== false)
      .sort((a, b) => a.priority - b.priority)

    // Evaluate non-default rules first
    for (const rule of sorted) {
      if (rule.isDefault) continue

      if (this.matchesRule(rule, context)) {
        this.logger.debug(
          `[Evaluation] Rule "${rule.name}" matched for context`
        )
        return rule.serveValue
      }
    }

    // Fallback to default rule
    const defaultRule = sorted.find((r) => r.isDefault)
    if (defaultRule) {
      return defaultRule.serveValue
    }

    return null
  }

  /**
   * Check if a single rule matches the given context.
   * AND operator: all conditions must match.
   * OR operator: at least one condition must match.
   */
  matchesRule(
    rule: TargetingRuleWithConditions,
    context: ToggleContext
  ): boolean {
    if (rule.conditions.length === 0) {
      return true
    }

    if (rule.operator === 'AND') {
      return rule.conditions.every((c) => this.matchesCondition(c, context))
    }

    // OR
    return rule.conditions.some((c) => this.matchesCondition(c, context))
  }

  /**
   * Evaluate a single condition against the context.
   */
  matchesCondition(
    condition: RuleConditionData,
    context: ToggleContext
  ): boolean {
    const contextValue = this.getContextValue(context, condition.attribute)

    // If context doesn't have the attribute, condition doesn't match
    // (except for NOT_EQUALS and NOT_IN which should match when attribute is missing)
    if (contextValue === undefined || contextValue === null) {
      return (
        condition.operator === 'NOT_EQUALS' ||
        condition.operator === 'NOT_CONTAINS' ||
        condition.operator === 'NOT_IN'
      )
    }

    const contextStr = String(contextValue)
    const conditionValue = condition.value

    switch (condition.operator) {
      case 'EQUALS':
        return contextStr === conditionValue

      case 'NOT_EQUALS':
        return contextStr !== conditionValue

      case 'CONTAINS':
        return contextStr.includes(conditionValue)

      case 'NOT_CONTAINS':
        return !contextStr.includes(conditionValue)

      case 'STARTS_WITH':
        return contextStr.startsWith(conditionValue)

      case 'ENDS_WITH':
        return contextStr.endsWith(conditionValue)

      case 'GREATER_THAN': {
        const numContext = Number(contextStr)
        const numCondition = Number(conditionValue)
        if (Number.isNaN(numContext) || Number.isNaN(numCondition)) return false
        return numContext > numCondition
      }

      case 'LESS_THAN': {
        const numContext = Number(contextStr)
        const numCondition = Number(conditionValue)
        if (Number.isNaN(numContext) || Number.isNaN(numCondition)) return false
        return numContext < numCondition
      }

      case 'IN': {
        const values = this.parseListValue(conditionValue)
        return values.includes(contextStr)
      }

      case 'NOT_IN': {
        const values = this.parseListValue(conditionValue)
        return !values.includes(contextStr)
      }

      case 'MATCHES_REGEX':
        return this.safeRegexTest(conditionValue, contextStr)

      default:
        this.logger.warn(`[Evaluation] Unknown operator: ${condition.operator}`)
        return false
    }
  }

  /**
   * Read an own property of the context. Prototype-related keys are ignored so
   * rules can never match against inherited members such as __proto__.
   */
  private getContextValue(context: ToggleContext, attribute: string): unknown {
    if (
      !context ||
      typeof context !== 'object' ||
      typeof attribute !== 'string' ||
      FORBIDDEN_ATTRIBUTE_KEYS.has(attribute) ||
      !Object.prototype.hasOwnProperty.call(context, attribute)
    ) {
      return undefined
    }
    return context[attribute]
  }

  /**
   * Test a tenant-defined regex against a context value with ReDoS
   * mitigations: bounded pattern and input length, and rejection of patterns
   * with nested quantifiers (e.g. "(a+)+"), which can cause catastrophic
   * backtracking. Rejected or invalid patterns never match.
   */
  private safeRegexTest(pattern: string, input: string): boolean {
    if (!isRegexPatternAllowed(pattern) || input.length > MAX_REGEX_INPUT_LENGTH) {
      this.logger.warn(
        '[Evaluation] Regex pattern or input rejected by safety limits'
      )
      return false
    }

    return new RegExp(pattern).test(input)
  }

  /**
   * Parse a comma-separated list value, trimming whitespace.
   * Supports JSON array format and simple comma-separated format.
   */
  private parseListValue(value: string): string[] {
    // Try JSON array first
    if (value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed.map(String)
        }
      } catch {
        // Fall through to comma-separated parsing
      }
    }

    return value.split(',').map((v) => v.trim())
  }
}
