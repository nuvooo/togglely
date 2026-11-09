import { Info, Plus, Trash2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import {
  CONDITION_OPERATORS,
  type ConditionOperator,
  formatCondition,
  isListOperator,
  MAX_CONDITIONS,
  nextPriority,
  type RuleMatchOperator,
  sortRulesByPriority,
  type TargetingRule,
  validateRuleInput,
} from '@/lib/targeting-rules'
import type { EnvironmentState, FlagType } from './types'

interface ConditionDraft {
  key: number
  attribute: string
  operator: ConditionOperator
  value: string
}

let conditionKeyCounter = 0
const emptyCondition = (): ConditionDraft => ({
  key: ++conditionKeyCounter,
  attribute: '',
  operator: 'EQUALS',
  value: '',
})

const defaultServeValue = (type: FlagType) => (type === 'BOOLEAN' ? 'true' : '')

const fieldClass =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

interface FlagTargetingTabProps {
  flagId: string
  flagType: FlagType
  environments: EnvironmentState[]
}

/** Targeting rules of one flag, per environment (list, create, toggle, delete). */
export function FlagTargetingTab({
  flagId,
  flagType,
  environments,
}: FlagTargetingTabProps) {
  const { t } = useTranslation()
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '')
  const [rules, setRules] = useState<TargetingRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [ruleName, setRuleName] = useState('')
  const [matchOperator, setMatchOperator] = useState<RuleMatchOperator>('AND')
  const [conditions, setConditions] = useState<ConditionDraft[]>(() => [
    emptyCondition(),
  ])
  const [serveValue, setServeValue] = useState(() =>
    defaultServeValue(flagType)
  )
  const [ruleToDelete, setRuleToDelete] = useState<TargetingRule | null>(null)

  // Keep the selection valid when the environments change.
  useEffect(() => {
    setEnvironmentId((current) =>
      environments.some((e) => e.id === current)
        ? current
        : (environments[0]?.id ?? '')
    )
  }, [environments])

  const loadRules = useCallback(async () => {
    if (!environmentId) {
      setRules([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(
        `/feature-flags/${flagId}/targeting-rules`,
        {
          params: { environmentId },
        }
      )
      setRules(response.data.rules ?? [])
    } catch (err) {
      setRules([])
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [flagId, environmentId])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const resetForm = () => {
    setRuleName('')
    setMatchOperator('AND')
    setConditions([emptyCondition()])
    setServeValue(defaultServeValue(flagType))
    setFormError(null)
  }

  const updateCondition = (key: number, patch: Partial<ConditionDraft>) => {
    setConditions((prev) =>
      prev.map((c) => (c.key === key ? { ...c, ...patch } : c))
    )
  }

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!environmentId) return

    const payload = {
      environmentId,
      name: ruleName.trim() || undefined,
      operator: matchOperator,
      serveValue,
      priority: nextPriority(rules),
      enabled: true,
      conditions: conditions.map((c) => ({
        attribute: c.attribute.trim(),
        operator: c.operator,
        value: isListOperator(c.operator)
          ? c.value
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
              .join(',')
          : c.value,
      })),
    }

    const validationError = validateRuleInput(flagType, payload)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const response = await api.post(
        `/feature-flags/${flagId}/targeting-rules`,
        payload
      )
      setRules((prev) => [...prev, response.data.rule])
      resetForm()
      setShowForm(false)
      toast.success(t('flag-detail.targeting.created'))
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return
    const ruleId = ruleToDelete.id
    try {
      await api.delete(`/feature-flags/${flagId}/targeting-rules/${ruleId}`)
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
      toast.success(t('flag-detail.targeting.deleted'))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleToggleRule = async (rule: TargetingRule) => {
    try {
      const response = await api.patch(
        `/feature-flags/${flagId}/targeting-rules/${rule.id}`,
        {
          enabled: !rule.enabled,
        }
      )
      const updated: TargetingRule | undefined = response.data?.rule
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? (updated ?? { ...r, enabled: !rule.enabled }) : r
        )
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const matchLabel = (operator: RuleMatchOperator) =>
    operator === 'OR'
      ? t('flag-detail.targeting.match-any')
      : t('flag-detail.targeting.match-all')

  let list: React.ReactNode
  if (environments.length === 0) {
    list = <EmptyState title={t('flag-detail.targeting.no-environments')} />
  } else if (loading) {
    list = (
      <div className="space-y-3 rounded-lg border bg-card p-6" aria-busy="true">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    )
  } else if (error) {
    list = (
      <ErrorState
        title={t('flag-detail.targeting.load-error')}
        message={error}
        onRetry={() => void loadRules()}
      />
    )
  } else if (rules.length === 0) {
    list = (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title={t('flag-detail.targeting.empty-title')}
        description={t('flag-detail.targeting.empty-description')}
      />
    )
  } else {
    list = (
      <ol className="divide-y overflow-hidden rounded-lg border bg-card">
        {sortRulesByPriority(rules).map((rule, index) => {
          const name = rule.name || t('flag-detail.targeting.unnamed')
          return (
            <li
              key={rule.id}
              className="flex items-start justify-between gap-4 p-4"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium">{name}</h4>
                    <Badge variant={rule.enabled ? 'success' : 'neutral'}>
                      {rule.enabled
                        ? t('flag-detail.targeting.active')
                        : t('flag-detail.targeting.inactive')}
                    </Badge>
                    <Badge variant="outline">{matchLabel(rule.operator)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                    {rule.conditions.map((condition, cIndex) => (
                      <span
                        key={condition.id ?? cIndex}
                        className="inline-flex items-center gap-1.5"
                      >
                        {cIndex > 0 && (
                          <span className="text-xs font-semibold text-primary">
                            {rule.operator}
                          </span>
                        )}
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {formatCondition(condition)}
                        </code>
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('flag-detail.targeting.serve')}{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                      {rule.serveValue}
                    </code>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={() => void handleToggleRule(rule)}
                  aria-label={t('flag-detail.targeting.toggle-label', { name })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setRuleToDelete(rule)}
                  aria-label={t('flag-detail.targeting.delete-label', { name })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">
            {t('flag-detail.targeting.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('flag-detail.targeting.description')}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label
              htmlFor="rules-environment"
              className="block text-xs font-medium text-muted-foreground"
            >
              {t('flag-detail.targeting.environment')}
            </label>
            <select
              id="rules-environment"
              value={environmentId}
              onChange={(e) => {
                setEnvironmentId(e.target.value)
                setFormError(null)
              }}
              disabled={environments.length === 0}
              className={`${fieldClass} mt-1 w-auto`}
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={() => {
              if (showForm) resetForm()
              setShowForm(!showForm)
            }}
            disabled={!environmentId}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('flag-detail.targeting.add')}
          </Button>
        </div>
      </div>

      <div className="flex gap-3 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        <Info className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <p>{t('flag-detail.targeting.info-order')}</p>
          <p>
            {t('flag-detail.targeting.info-context')}{' '}
            <code className="rounded bg-muted px-1 font-mono text-xs">
              {"context: { userId: 'user-123', country: 'DE' }"}
            </code>
          </p>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleAddRule}
          className="space-y-4 rounded-lg border bg-card p-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rule-name" className="block text-sm font-medium">
                {t('flag-detail.targeting.rule-name')}{' '}
                <span className="text-muted-foreground">
                  ({t('common.optional')})
                </span>
              </label>
              <Input
                id="rule-name"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                maxLength={200}
                placeholder={t('flag-detail.targeting.rule-name-placeholder')}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="rule-match" className="block text-sm font-medium">
                {t('flag-detail.targeting.match')}
              </label>
              <select
                id="rule-match"
                value={matchOperator}
                onChange={(e) =>
                  setMatchOperator(e.target.value as RuleMatchOperator)
                }
                className={`${fieldClass} mt-1`}
              >
                <option value="AND">
                  {t('flag-detail.targeting.match-all')}
                </option>
                <option value="OR">
                  {t('flag-detail.targeting.match-any')}
                </option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium">
              {t('flag-detail.targeting.conditions')}
            </span>
            {conditions.map((condition, index) => (
              <div key={condition.key}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  {index > 0 && (
                    <span className="self-center text-xs font-semibold text-primary sm:w-10 sm:text-center">
                      {matchOperator}
                    </span>
                  )}
                  {index === 0 && conditions.length > 1 && (
                    <span className="hidden sm:block sm:w-10" />
                  )}
                  <Input
                    aria-label={t('flag-detail.targeting.condition-attribute', {
                      n: index + 1,
                    })}
                    value={condition.attribute}
                    onChange={(e) =>
                      updateCondition(condition.key, {
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
                    aria-label={t('flag-detail.targeting.condition-operator', {
                      n: index + 1,
                    })}
                    value={condition.operator}
                    onChange={(e) =>
                      updateCondition(condition.key, {
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
                      n: index + 1,
                    })}
                    value={condition.value}
                    onChange={(e) =>
                      updateCondition(condition.key, { value: e.target.value })
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
                      setConditions((prev) =>
                        prev.filter((c) => c.key !== condition.key)
                      )
                    }
                    disabled={conditions.length <= 1}
                    aria-label={t('flag-detail.targeting.remove-condition', {
                      n: index + 1,
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
            ))}
            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              onClick={() =>
                setConditions((prev) => [...prev, emptyCondition()])
              }
              disabled={conditions.length >= MAX_CONDITIONS}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('flag-detail.targeting.add-condition')}
            </Button>
          </div>

          <div>
            <label
              htmlFor="rule-serve-value"
              className="block text-sm font-medium"
            >
              {t('flag-detail.targeting.serve-value', { type: flagType })}
            </label>
            {flagType === 'BOOLEAN' ? (
              <select
                id="rule-serve-value"
                value={serveValue}
                onChange={(e) => setServeValue(e.target.value)}
                className={`${fieldClass} mt-1 sm:w-48`}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : flagType === 'JSON' ? (
              <textarea
                id="rule-serve-value"
                value={serveValue}
                onChange={(e) => setServeValue(e.target.value)}
                rows={4}
                placeholder='{"key": "value"}'
                required
                className={`${fieldClass} mt-1 font-mono`}
              />
            ) : (
              <Input
                id="rule-serve-value"
                type={flagType === 'NUMBER' ? 'number' : 'text'}
                step={flagType === 'NUMBER' ? 'any' : undefined}
                value={serveValue}
                onChange={(e) => setServeValue(e.target.value)}
                placeholder={
                  flagType === 'NUMBER'
                    ? 'e.g. 42'
                    : t('flag-detail.targeting.serve-placeholder')
                }
                required
                className="mt-1"
              />
            )}
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm()
                setShowForm(false)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? t('flag-detail.saving')
                : t('flag-detail.targeting.add')}
            </Button>
          </div>
        </form>
      )}

      {list}

      <ConfirmDialog
        open={!!ruleToDelete}
        onOpenChange={(open) => !open && setRuleToDelete(null)}
        title={t('flag-detail.targeting.delete-title')}
        description={t('flag-detail.targeting.delete-description', {
          name: ruleToDelete?.name || t('flag-detail.targeting.unnamed'),
        })}
        confirmLabel={t('common.delete')}
        onConfirm={handleDeleteRule}
      />
    </div>
  )
}
