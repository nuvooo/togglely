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
    context: ToggleContext,
  ): string | null {
    if (rules.length === 0) {
      return null
    }

    // Sort by priority (lowest number = highest priority)
    const sorted = [...rules].sort((a, b) => a.priority - b.priority)

    // Evaluate non-default rules first
    for (const rule of sorted) {
      if (rule.isDefault) continue

      if (this.matchesRule(rule, context)) {
        this.logger.debug(
          `[Evaluation] Rule "${rule.name}" matched for context`,
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
    context: ToggleContext,
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
    context: ToggleContext,
  ): boolean {
    const contextValue = context[condition.attribute]

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

      case 'MATCHES_REGEX': {
        try {
          const regex = new RegExp(conditionValue)
          return regex.test(contextStr)
        } catch {
          this.logger.warn(
            `[Evaluation] Invalid regex pattern: ${conditionValue}`,
          )
          return false
        }
      }

      default:
        this.logger.warn(
          `[Evaluation] Unknown operator: ${condition.operator}`,
        )
        return false
    }
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
