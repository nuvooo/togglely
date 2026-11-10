import { Plus, X } from 'lucide-react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CONDITION_OPERATORS,
  type ConditionOperator,
  isListOperator,
  MAX_CONDITIONS,
  MAX_GROUPS,
  type RuleMatchOperator,
  ruleGroups,
  type TargetingRule,
} from '@/lib/targeting-rules'

export const fieldClass =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export interface ConditionDraft {
  key: number
  attribute: string
  operator: ConditionOperator
  value: string
}

export interface GroupDraft {
  key: number
  /** Combines the conditions of this group. */
  operator: RuleMatchOperator
  conditions: ConditionDraft[]
}

let draftKey = 0

export const emptyCondition = (): ConditionDraft => ({
  key: ++draftKey,
  attribute: '',
  operator: 'EQUALS',
  value: '',
})

export const emptyGroup = (): GroupDraft => ({
  key: ++draftKey,
  operator: 'AND',
  conditions: [emptyCondition()],
})

/** Editable copy of a rule's condition groups. */
export function groupsFromRule(rule: TargetingRule): GroupDraft[] {
  const groups = ruleGroups(rule)
  if (groups.length === 0) return [emptyGroup()]
  return groups.map((group) => ({
    key: ++draftKey,
    operator: group.operator,
    conditions: group.conditions.map((c) => ({
      key: ++draftKey,
      attribute: c.attribute,
      operator: c.operator,
      value: c.value,
    })),
  }))
}

interface RuleConditionsEditorProps {
  groups: GroupDraft[]
  /** Combines the groups (only relevant with more than one group). */
  ruleOperator: RuleMatchOperator
  onGroupsChange: (groups: GroupDraft[]) => void
  onRuleOperatorChange: (operator: RuleMatchOperator) => void
}

/**
 * Conditions of a targeting rule. One group looks like a plain condition
 * list ("Match all/any"); more groups show as cards, each with its own
 * match mode, combined by the rule operator, e.g. A AND (B OR C).
 * Conditions are numbered across all groups for their labels.
 */
export function RuleConditionsEditor({
  groups,
  ruleOperator,
  onGroupsChange,
  onRuleOperatorChange,
}: RuleConditionsEditorProps) {
  const { t } = useTranslation()
  const multi = groups.length > 1
  const total = groups.reduce((sum, g) => sum + g.conditions.length, 0)

  const updateGroup = (key: number, patch: Partial<GroupDraft>) =>
    onGroupsChange(groups.map((g) => (g.key === key ? { ...g, ...patch } : g)))

  const updateCondition = (
    group: GroupDraft,
    key: number,
    patch: Partial<ConditionDraft>
  ) =>
    updateGroup(group.key, {
      conditions: group.conditions.map((c) =>
        c.key === key ? { ...c, ...patch } : c
      ),
    })

  const matchOptions = (
    <>
      <option value="AND">{t('flag-detail.targeting.match-all')}</option>
      <option value="OR">{t('flag-detail.targeting.match-any')}</option>
    </>
  )

  // Running number of a condition across all groups
  let number = 0

  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium">
        {t('flag-detail.targeting.conditions')}
      </span>

      {multi ? (
        <div className="sm:w-72">
          <label
            htmlFor="rule-groups-match"
            className="block text-xs font-medium text-muted-foreground"
          >
            {t('flag-detail.targeting.combine-groups')}
          </label>
          <select
            id="rule-groups-match"
            value={ruleOperator}
            onChange={(e) =>
              onRuleOperatorChange(e.target.value as RuleMatchOperator)
            }
            className={`${fieldClass} mt-1`}
          >
            <option value="AND">{t('flag-detail.targeting.groups-all')}</option>
            <option value="OR">{t('flag-detail.targeting.groups-any')}</option>
          </select>
        </div>
      ) : (
        <div className="sm:w-72">
          <label
            htmlFor="rule-match"
            className="block text-xs font-medium text-muted-foreground"
          >
            {t('flag-detail.targeting.match')}
          </label>
          <select
            id="rule-match"
            value={groups[0]?.operator ?? 'AND'}
            onChange={(e) =>
              updateGroup(groups[0].key, {
                operator: e.target.value as RuleMatchOperator,
              })
            }
            className={`${fieldClass} mt-1`}
          >
            {matchOptions}
          </select>
        </div>
      )}

      {groups.map((group, gIndex) => (
        <Fragment key={group.key}>
          {gIndex > 0 && (
            <p className="text-xs font-semibold text-primary">{ruleOperator}</p>
          )}
          <div
            className={
              multi
                ? 'space-y-2 rounded-md border bg-muted/30 p-3'
                : 'space-y-2'
            }
          >
            {multi && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {t('flag-detail.targeting.group-title', { n: gIndex + 1 })}
                </span>
                <div className="flex items-center gap-1">
                  <select
                    aria-label={t('flag-detail.targeting.group-match', {
                      n: gIndex + 1,
                    })}
                    value={group.operator}
                    onChange={(e) =>
                      updateGroup(group.key, {
                        operator: e.target.value as RuleMatchOperator,
                      })
                    }
                    className={`${fieldClass} w-auto`}
                  >
                    {matchOptions}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      onGroupsChange(groups.filter((g) => g.key !== group.key))
                    }
                    aria-label={t('flag-detail.targeting.remove-group', {
                      n: gIndex + 1,
                    })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {group.conditions.map((condition, index) => {
              const n = ++number
              return (
                <div key={condition.key}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    {index > 0 && (
                      <span className="self-center text-xs font-semibold text-primary sm:w-10 sm:text-center">
                        {group.operator}
                      </span>
                    )}
                    {index === 0 && group.conditions.length > 1 && (
                      <span className="hidden sm:block sm:w-10" />
                    )}
                    <Input
                      aria-label={t(
                        'flag-detail.targeting.condition-attribute',
                        {
                          n,
                        }
                      )}
                      value={condition.attribute}
                      onChange={(e) =>
                        updateCondition(group, condition.key, {
                          attribute: e.target.value,
                        })
                      }
                      placeholder={t(
                        'flag-detail.targeting.attribute-placeholder'
                      )}
                      maxLength={100}
                      required
                      className="sm:flex-1"
                    />
                    <select
                      aria-label={t(
                        'flag-detail.targeting.condition-operator',
                        {
                          n,
                        }
                      )}
                      value={condition.operator}
                      onChange={(e) =>
                        updateCondition(group, condition.key, {
                          operator: e.target.value as ConditionOperator,
                        })
                      }
                      className={`${fieldClass} sm:w-44`}
                    >
                      {CONDITION_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label={t('flag-detail.targeting.condition-value', {
                        n,
                      })}
                      value={condition.value}
                      onChange={(e) =>
                        updateCondition(group, condition.key, {
                          value: e.target.value,
                        })
                      }
                      placeholder={
                        isListOperator(condition.operator)
                          ? 'DE, AT, CH'
                          : t('flag-detail.targeting.value-placeholder')
                      }
                      maxLength={1000}
                      required
                      className="sm:flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 self-center text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        updateGroup(group.key, {
                          conditions: group.conditions.filter(
                            (c) => c.key !== condition.key
                          ),
                        })
                      }
                      // A group keeps at least one condition; remove the group instead
                      disabled={group.conditions.length <= 1}
                      aria-label={t('flag-detail.targeting.remove-condition', {
                        n,
                      })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {isListOperator(condition.operator) && (
                    <p className="mt-1 text-xs text-muted-foreground sm:ml-12">
                      {t('flag-detail.targeting.list-hint')}
                    </p>
                  )}
                </div>
              )
            })}

            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              onClick={() =>
                updateGroup(group.key, {
                  conditions: [...group.conditions, emptyCondition()],
                })
              }
              disabled={total >= MAX_CONDITIONS}
              aria-label={
                multi
                  ? t('flag-detail.targeting.add-condition-to-group', {
                      n: gIndex + 1,
                    })
                  : undefined
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('flag-detail.targeting.add-condition')}
            </Button>
          </div>
        </Fragment>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onGroupsChange([...groups, emptyGroup()])}
        disabled={groups.length >= MAX_GROUPS || total >= MAX_CONDITIONS}
      >
        <Plus className="mr-1 h-4 w-4" />
        {t('flag-detail.targeting.add-group')}
      </Button>
    </div>
  )
}
