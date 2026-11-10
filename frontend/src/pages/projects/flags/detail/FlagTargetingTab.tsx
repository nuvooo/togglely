import { Info, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import { handleForbidden, notifyWriteError } from '@/lib/permissions'
import {
  CONDITION_OPERATORS,
  type ConditionOperator,
  formatCondition,
  fromLocalInputValue,
  isListOperator,
  MAX_CONDITIONS,
  nextPriority,
  normalizeConditionValue,
  type RuleMatchOperator,
  ruleScheduleStatus,
  sortRulesByPriority,
  type TargetingRule,
  toLocalInputValue,
  validateRuleInput,
  validateWindow,
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

export interface TargetingBrand {
  id: string
  name: string
}

const NO_BRANDS: TargetingBrand[] = []

interface FlagTargetingTabProps {
  flagId: string
  flagType: FlagType
  environments: EnvironmentState[]
  /** MULTI projects: brands that can get own rules. */
  brands?: TargetingBrand[]
  /** Brand rules were created or reset (a brand override may be new). */
  onBrandRulesChanged?: () => void
  /** No write permission (VIEWER): rules can be read only. */
  readOnly?: boolean
}

/**
 * Targeting rules of one flag, per environment and optionally per brand
 * (list, create, edit, toggle, delete). A brand without own rules shows the
 * inherited environment rules read-only.
 */
export function FlagTargetingTab({
  flagId,
  flagType,
  environments,
  brands = NO_BRANDS,
  onBrandRulesChanged,
  readOnly = false,
}: FlagTargetingTabProps) {
  const { t, i18n } = useTranslation()
  const readOnlyTitle = readOnly ? t('common.read-only') : undefined
  /** Bumped per load; rules of another flag/environment arriving late are dropped. */
  const loadId = useRef(0)
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '')
  /** '' = rules of the environment (all brands). */
  const [brandId, setBrandId] = useState('')
  /** The selected brand has no own rules; `rules` are the environment's. */
  const [inherited, setInherited] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
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
  /** Time window as `datetime-local` values (local time), '' = open. */
  const [activeFrom, setActiveFrom] = useState('')
  const [activeUntil, setActiveUntil] = useState('')
  const [ruleToDelete, setRuleToDelete] = useState<TargetingRule | null>(null)
  /** Rule currently being edited; null = the form creates a new rule. */
  const [editingRule, setEditingRule] = useState<TargetingRule | null>(null)

  // Keep the selection valid when the environments change.
  useEffect(() => {
    setEnvironmentId((current) =>
      environments.some((e) => e.id === current)
        ? current
        : (environments[0]?.id ?? '')
    )
  }, [environments])

  // Brands can disappear (e.g. after a reload of the brand values).
  useEffect(() => {
    setBrandId((current) =>
      current === '' || brands.some((b) => b.id === current) ? current : ''
    )
  }, [brands])

  const loadRules = useCallback(async () => {
    const id = ++loadId.current
    const current = () => id === loadId.current
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
          params: brandId ? { environmentId, brandId } : { environmentId },
        }
      )
      if (!current()) return
      setRules(response.data.rules ?? [])
      setInherited(Boolean(brandId && response.data.inherited))
    } catch (err) {
      if (!current()) return
      setRules([])
      setInherited(false)
      setError(getErrorMessage(err))
    } finally {
      if (current()) setLoading(false)
    }
  }, [flagId, environmentId, brandId])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const resetForm = () => {
    setRuleName('')
    setMatchOperator('AND')
    setConditions([emptyCondition()])
    setServeValue(defaultServeValue(flagType))
    setActiveFrom('')
    setActiveUntil('')
    setFormError(null)
    setEditingRule(null)
  }

  const updateCondition = (key: number, patch: Partial<ConditionDraft>) => {
    setConditions((prev) =>
      prev.map((c) => (c.key === key ? { ...c, ...patch } : c))
    )
  }

  const startEdit = (rule: TargetingRule) => {
    setEditingRule(rule)
    setRuleName(rule.name ?? '')
    setMatchOperator(rule.operator)
    setConditions(
      rule.conditions.map((c) => ({
        key: ++conditionKeyCounter,
        attribute: c.attribute,
        operator: c.operator,
        value: c.value,
      }))
    )
    setServeValue(rule.serveValue)
    setActiveFrom(toLocalInputValue(rule.activeFrom))
    setActiveUntil(toLocalInputValue(rule.activeUntil))
    setFormError(null)
    setShowForm(true)
  }

  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!environmentId) return

    const fields = {
      operator: matchOperator,
      serveValue,
      conditions: conditions.map((c) => ({
        attribute: c.attribute.trim(),
        operator: c.operator,
        value: normalizeConditionValue(c.operator, c.value),
      })),
    }
    const name = ruleName.trim()
    const window = {
      activeFrom: fromLocalInputValue(activeFrom),
      activeUntil: fromLocalInputValue(activeUntil),
    }

    const validationError =
      validateRuleInput(flagType, {
        ...fields,
        name: name || undefined,
      }) ?? validateWindow(window.activeFrom, window.activeUntil)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (editingRule) {
        const ruleId = editingRule.id
        // Empty name / window fields clear them (null on the API)
        const response = await api.patch(
          `/feature-flags/${flagId}/targeting-rules/${ruleId}`,
          { name, ...fields, ...window }
        )
        const updated: TargetingRule = response.data.rule
        setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)))
        toast.success(t('flag-detail.targeting.updated'))
      } else {
        const response = await api.post(
          `/feature-flags/${flagId}/targeting-rules`,
          {
            environmentId,
            ...(brandId ? { brandId } : {}),
            name: name || undefined,
            ...fields,
            ...(window.activeFrom ? { activeFrom: window.activeFrom } : {}),
            ...(window.activeUntil ? { activeUntil: window.activeUntil } : {}),
            // The first own brand rule starts a new list
            priority: inherited ? 0 : nextPriority(rules),
            enabled: true,
          }
        )
        const created: TargetingRule = response.data.rule
        setRules((prev) => (inherited ? [created] : [...prev, created]))
        setInherited(false)
        if (brandId) onBrandRulesChanged?.()
        toast.success(t('flag-detail.targeting.created'))
      }
      resetForm()
      setShowForm(false)
    } catch (err) {
      handleForbidden(err, t)
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
      const remaining = rules.filter((r) => r.id !== ruleId)
      setRules(remaining)
      // Without own rules the brand inherits the environment rules again
      if (brandId && remaining.length === 0) void loadRules()
      if (editingRule?.id === ruleId) {
        resetForm()
        setShowForm(false)
      }
      toast.success(t('flag-detail.targeting.deleted'))
    } catch (err) {
      // The confirm dialog stays open and shows the message.
      handleForbidden(err, t)
      throw err
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
      notifyWriteError(err, t)
    }
  }

  const handleResetBrand = async () => {
    try {
      await api.delete(`/feature-flags/${flagId}/targeting-rules`, {
        params: { environmentId, brandId },
      })
      if (editingRule) {
        resetForm()
        setShowForm(false)
      }
      toast.success(t('flag-detail.targeting.reset-brand-done'))
      onBrandRulesChanged?.()
      void loadRules()
    } catch (err) {
      // The confirm dialog stays open and shows the message.
      handleForbidden(err, t)
      throw err
    }
  }

  /** Environment or brand changed: an open edit form belongs to the old scope. */
  const leaveScope = () => {
    if (editingRule) {
      resetForm()
      setShowForm(false)
    } else {
      setFormError(null)
    }
  }

  /** Inherited rules are shown read-only; they are changed on the environment. */
  const rulesEditable = !readOnly && !inherited
  const selectedBrand = brands.find((b) => b.id === brandId)

  const scheduleLabel = ({
    kind,
    at,
  }: NonNullable<ReturnType<typeof ruleScheduleStatus>>) => {
    if (kind === 'expired') return t('flag-detail.targeting.schedule-expired')
    const date = new Date(at).toLocaleString(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    return kind === 'scheduled'
      ? t('flag-detail.targeting.schedule-scheduled', { date })
      : t('flag-detail.targeting.schedule-active-until', { date })
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
          const schedule = ruleScheduleStatus(rule)
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
                    {schedule && (
                      <Badge
                        variant={
                          schedule.kind === 'expired' ? 'neutral' : 'warning'
                        }
                      >
                        {scheduleLabel(schedule)}
                      </Badge>
                    )}
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
                <span title={readOnlyTitle} className="inline-flex">
                  <Switch
                    checked={rule.enabled}
                    disabled={!rulesEditable}
                    onCheckedChange={() => void handleToggleRule(rule)}
                    aria-label={t('flag-detail.targeting.toggle-label', {
                      name,
                    })}
                  />
                </span>
                {rulesEditable && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => startEdit(rule)}
                      aria-label={t('flag-detail.targeting.edit-label', {
                        name,
                      })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setRuleToDelete(rule)}
                      aria-label={t('flag-detail.targeting.delete-label', {
                        name,
                      })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
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
                leaveScope()
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
          {brands.length > 0 && (
            <div>
              <label
                htmlFor="rules-brand"
                className="block text-xs font-medium text-muted-foreground"
              >
                {t('flag-detail.targeting.brand')}
              </label>
              <select
                id="rules-brand"
                value={brandId}
                onChange={(e) => {
                  setBrandId(e.target.value)
                  leaveScope()
                }}
                disabled={environments.length === 0}
                className={`${fieldClass} mt-1 w-auto`}
              >
                <option value="">{t('flag-detail.targeting.brand-all')}</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!readOnly && (
            <Button
              onClick={() => {
                // While editing, switch to an empty create form
                if (editingRule) {
                  resetForm()
                  setShowForm(true)
                  return
                }
                if (showForm) resetForm()
                setShowForm(!showForm)
              }}
              disabled={!environmentId}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t('flag-detail.targeting.add')}
            </Button>
          )}
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

      {brandId && !loading && !error && (inherited || !readOnly) && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            {inherited
              ? t('flag-detail.targeting.inherited-info', {
                  brand: selectedBrand?.name ?? '',
                })
              : t('flag-detail.targeting.own-brand-rules', {
                  brand: selectedBrand?.name ?? '',
                })}
          </p>
          {!inherited && !readOnly && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setConfirmReset(true)}
            >
              {t('flag-detail.targeting.reset-brand')}
            </Button>
          )}
        </div>
      )}

      {showForm && !readOnly && (
        <form
          onSubmit={handleSubmitRule}
          className="space-y-4 rounded-lg border bg-card p-4"
        >
          {editingRule && (
            <h3 className="text-sm font-semibold">
              {t('flag-detail.targeting.edit-title')}
            </h3>
          )}
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

          <div className="space-y-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rule-active-from"
                  className="block text-sm font-medium"
                >
                  {t('flag-detail.targeting.active-from')}{' '}
                  <span className="text-muted-foreground">
                    ({t('common.optional')})
                  </span>
                </label>
                <Input
                  id="rule-active-from"
                  type="datetime-local"
                  value={activeFrom}
                  onChange={(e) => setActiveFrom(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label
                  htmlFor="rule-active-until"
                  className="block text-sm font-medium"
                >
                  {t('flag-detail.targeting.active-until')}{' '}
                  <span className="text-muted-foreground">
                    ({t('common.optional')})
                  </span>
                </label>
                <Input
                  id="rule-active-until"
                  type="datetime-local"
                  value={activeUntil}
                  onChange={(e) => setActiveUntil(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('flag-detail.targeting.window-hint')}
            </p>
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
                : editingRule
                  ? t('common.save')
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

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('flag-detail.targeting.reset-brand-title')}
        description={t('flag-detail.targeting.reset-brand-description', {
          brand: selectedBrand?.name ?? '',
        })}
        confirmLabel={t('flag-detail.targeting.reset-brand-confirm')}
        onConfirm={handleResetBrand}
      />
    </div>
  )
}
