import { Info, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
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
  type ConditionNode,
  formatCondition,
  fromLocalInputValue,
  hasNestedBlocks,
  nextPriority,
  type RuleMatchOperator,
  type RuleScope,
  ruleScheduleStatus,
  ruleTree,
  sortRulesByPriority,
  type TargetingRule,
  toLocalInputValue,
  treeLeaves,
  validateRuleInput,
  validateTree,
  validateWindow,
} from '@/lib/targeting-rules'
import {
  draftFromTree,
  emptyRoot,
  fieldClass,
  type RootDraft,
  RuleConditionsEditor,
  treeFromDraft,
} from './RuleConditionsEditor'
import {
  EMPTY_SCOPE,
  RuleScopeEditor,
  type ScopeOption,
} from './RuleScopeEditor'
import type { EnvironmentState, FlagType } from './types'

const defaultServeValue = (type: FlagType) => (type === 'BOOLEAN' ? 'true' : '')

export type TargetingBrand = ScopeOption

const NO_BRANDS: TargetingBrand[] = []

const scopeOf = (rule: TargetingRule): RuleScope => ({
  environmentIds: rule.environmentIds ?? [],
  environmentsExcluded: rule.environmentsExcluded ?? false,
  brandIds: rule.brandIds ?? [],
  brandsExcluded: rule.brandsExcluded ?? false,
})

interface FlagTargetingTabProps {
  flagId: string
  flagType: FlagType
  environments: EnvironmentState[]
  /** MULTI projects: brands a rule can be limited to. */
  brands?: TargetingBrand[]
  /** No write permission (VIEWER): rules can be read only. */
  readOnly?: boolean
}

/**
 * Targeting rules of one flag (list, create, edit, toggle, delete). Rules are
 * flag-wide: each rule says where it applies (environments, brands) next to
 * its conditions; the first matching rule wins.
 */
export function FlagTargetingTab({
  flagId,
  flagType,
  environments,
  brands = NO_BRANDS,
  readOnly = false,
}: FlagTargetingTabProps) {
  const { t, i18n } = useTranslation()
  const readOnlyTitle = readOnly ? t('common.read-only') : undefined
  /** Bumped per load; rules of another flag arriving late are dropped. */
  const loadId = useRef(0)
  const [rules, setRules] = useState<TargetingRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [ruleName, setRuleName] = useState('')
  const [scope, setScope] = useState<RuleScope>(EMPTY_SCOPE)
  const [conditionRoot, setConditionRoot] = useState<RootDraft>(emptyRoot)
  const [serveValue, setServeValue] = useState(() =>
    defaultServeValue(flagType)
  )
  /** Time window as `datetime-local` values (local time), '' = open. */
  const [activeFrom, setActiveFrom] = useState('')
  const [activeUntil, setActiveUntil] = useState('')
  const [ruleToDelete, setRuleToDelete] = useState<TargetingRule | null>(null)
  /** Rule currently being edited; null = the form creates a new rule. */
  const [editingRule, setEditingRule] = useState<TargetingRule | null>(null)

  const loadRules = useCallback(async () => {
    const id = ++loadId.current
    const current = () => id === loadId.current
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(`/feature-flags/${flagId}/targeting-rules`)
      if (!current()) return
      setRules(response.data.rules ?? [])
    } catch (err) {
      if (!current()) return
      setRules([])
      setError(getErrorMessage(err))
    } finally {
      if (current()) setLoading(false)
    }
  }, [flagId])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const resetForm = () => {
    setRuleName('')
    setScope(EMPTY_SCOPE)
    setConditionRoot(emptyRoot())
    setServeValue(defaultServeValue(flagType))
    setActiveFrom('')
    setActiveUntil('')
    setFormError(null)
    setEditingRule(null)
  }

  const startEdit = (rule: TargetingRule) => {
    setEditingRule(rule)
    setRuleName(rule.name ?? '')
    setScope(scopeOf(rule))
    setConditionRoot(draftFromTree(ruleTree(rule)))
    setServeValue(rule.serveValue)
    setActiveFrom(toLocalInputValue(rule.activeFrom))
    setActiveUntil(toLocalInputValue(rule.activeUntil))
    setFormError(null)
    setShowForm(true)
  }

  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault()

    const conditionTree = treeFromDraft(conditionRoot)
    const fields = { operator: conditionTree.type, serveValue, conditionTree }
    const name = ruleName.trim()
    const window = {
      activeFrom: fromLocalInputValue(activeFrom),
      activeUntil: fromLocalInputValue(activeUntil),
    }

    const validationError =
      validateTree(conditionTree) ??
      validateRuleInput(flagType, {
        operator: conditionTree.type,
        serveValue,
        conditions: treeLeaves(conditionTree),
        name: name || undefined,
      }) ??
      validateWindow(window.activeFrom, window.activeUntil)
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
          { name, ...scope, ...fields, ...window }
        )
        const updated: TargetingRule = response.data.rule
        setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)))
        toast.success(t('flag-detail.targeting.updated'))
      } else {
        const response = await api.post(
          `/feature-flags/${flagId}/targeting-rules`,
          {
            name: name || undefined,
            ...scope,
            ...fields,
            ...(window.activeFrom ? { activeFrom: window.activeFrom } : {}),
            ...(window.activeUntil ? { activeUntil: window.activeUntil } : {}),
            priority: nextPriority(rules),
            enabled: true,
          }
        )
        setRules((prev) => [...prev, response.data.rule])
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
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
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

  /** "Dev, Prod" / "All environments" / "All environments except Prod" */
  const scopeLabel = (
    ids: string[],
    excluded: boolean,
    options: ScopeOption[],
    all: string
  ) => {
    if (ids.length === 0) return all
    const names = ids
      .map((id) => options.find((o) => o.id === id)?.name ?? id)
      .join(', ')
    return excluded
      ? t('flag-detail.targeting.scope-except', { all, names })
      : names
  }

  // Stable React keys for tree nodes (nodes have no ids)
  const nodeIds = new Map<ConditionNode, number>()
  const nodeId = (node: ConditionNode) => {
    if (!nodeIds.has(node)) nodeIds.set(node, nodeIds.size + 1)
    return nodeIds.get(node)
  }

  /**
   * Conditions as chips with AND / OR between them; blocks below the root
   * in parentheses, NOT (none of its entries matches) as NOT (x OR y).
   */
  const renderTree = (node: ConditionNode, root = true): React.ReactNode => {
    if (node.type === 'condition') {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {formatCondition(node)}
        </code>
      )
    }
    const parens = !root || node.type === 'NOT'
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {node.type === 'NOT' && (
          <span className="text-xs font-semibold text-destructive">NOT</span>
        )}
        {parens && <span className="text-muted-foreground">(</span>}
        {node.children.map((child, index) => (
          <Fragment key={nodeId(child)}>
            {index > 0 && (
              <span className="text-xs font-semibold text-primary">
                {node.type === 'AND' ? 'AND' : 'OR'}
              </span>
            )}
            {renderTree(child, false)}
          </Fragment>
        ))}
        {parens && <span className="text-muted-foreground">)</span>}
      </span>
    )
  }

  let list: React.ReactNode
  if (loading) {
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
          const tree = ruleTree(rule)
          const ruleScope = scopeOf(rule)
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
                    {!hasNestedBlocks(tree) && tree.children.length > 1 && (
                      <Badge variant="outline">{matchLabel(tree.type)}</Badge>
                    )}
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
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="secondary">
                      {scopeLabel(
                        ruleScope.environmentIds,
                        ruleScope.environmentsExcluded,
                        environments,
                        t('flag-detail.targeting.scope-all-environments')
                      )}
                    </Badge>
                    {brands.length > 0 && (
                      <Badge variant="secondary">
                        {scopeLabel(
                          ruleScope.brandIds,
                          ruleScope.brandsExcluded,
                          brands,
                          t('flag-detail.targeting.scope-all-brands')
                        )}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                    {renderTree(tree)}
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
                    disabled={readOnly}
                    onCheckedChange={() => void handleToggleRule(rule)}
                    aria-label={t('flag-detail.targeting.toggle-label', {
                      name,
                    })}
                  />
                </span>
                {!readOnly && (
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
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('flag-detail.targeting.add')}
          </Button>
        )}
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
          </div>

          <RuleScopeEditor
            environments={environments}
            brands={brands}
            scope={scope}
            onChange={setScope}
          />

          <RuleConditionsEditor
            root={conditionRoot}
            onChange={setConditionRoot}
          />

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
    </div>
  )
}
