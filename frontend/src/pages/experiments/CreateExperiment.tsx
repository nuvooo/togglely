import { Loader2, Plus, Scale, Trash2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageHeader } from '@/components/page/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/errors'
import { experimentPath, projectPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { experimentsApi, LIMITS, type ProjectEnvironment, type ProjectFlag } from './components/api'
import { Field, FormSection, fieldAria } from './components/FormSection'
import { useExperimentPermissions, useExperimentProjectId } from './components/hooks'
import {
  type DraftErrors,
  type ExperimentDraft,
  toKey,
  type VariantDraft,
  validateDraft,
  weightTotal,
} from './components/validation'

let uidCounter = 0
const uid = () => `v${++uidCounter}`

const initialVariants = (): VariantDraft[] => [
  { uid: uid(), key: 'control', name: 'Control', value: '', weight: '50', isControl: true },
  { uid: uid(), key: 'variant_a', name: 'Variant A', value: '', weight: '50', isControl: false },
]

const TEXTAREA =
  'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[invalid=true]:border-destructive'

const INVALID = 'aria-[invalid=true]:border-destructive'

export default function CreateExperiment() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const projectId = useExperimentProjectId()
  const [searchParams] = useSearchParams()
  const { canEdit, roleLoading } = useExperimentPermissions(projectId)
  const listPath = projectPath(projectId, 'experiments')

  const [flags, setFlags] = useState<ProjectFlag[]>([])
  const [environments, setEnvironments] = useState<ProjectEnvironment[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState(false)

  const [draft, setDraft] = useState<ExperimentDraft>(() => ({
    name: '',
    key: '',
    description: '',
    hypothesis: '',
    flagId: searchParams.get('flagId') ?? '',
    environmentId: '',
    trafficPercent: '100',
    variants: initialVariants(),
  }))
  const [keyEdited, setKeyEdited] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true)
    setOptionsError(false)
    try {
      const [flagList, envList] = await Promise.all([
        experimentsApi.flags(projectId),
        experimentsApi.environments(projectId),
      ])
      setFlags(flagList)
      setEnvironments(envList)
      setDraft((d) => ({
        ...d,
        // Drop a preselected flag from another project; a single environment is the obvious choice
        flagId: flagList.some((f) => f.id === d.flagId) ? d.flagId : '',
        environmentId: d.environmentId || (envList.length === 1 ? envList[0].id : ''),
      }))
    } catch {
      setOptionsError(true)
    } finally {
      setOptionsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) loadOptions()
  }, [projectId, loadOptions])

  const flag = flags.find((f) => f.id === draft.flagId)
  const flagType = flag?.flagType
  const errors: DraftErrors = submitted ? validateDraft(draft, flagType) : {}
  const err = (field: string) => {
    const e = errors[field]
    return e ? t(`experiments-page.form.errors.${e.code}`, e.params) : undefined
  }

  const update = <K extends keyof ExperimentDraft>(field: K, value: ExperimentDraft[K]) =>
    setDraft((d) => ({ ...d, [field]: value }))

  const setName = (name: string) =>
    setDraft((d) => ({ ...d, name, key: keyEdited ? d.key : toKey(name) }))

  const setFlag = (flagId: string) => {
    const next = flags.find((f) => f.id === flagId)
    setDraft((d) => ({
      ...d,
      flagId,
      // Boolean flags only take true/false: prefill so the form is valid right away
      variants:
        next?.flagType === 'BOOLEAN'
          ? d.variants.map((v) =>
              v.value === 'true' || v.value === 'false' ? v : { ...v, value: v.isControl ? 'false' : 'true' }
            )
          : d.variants,
    }))
  }

  const updateVariant = (index: number, patch: Partial<VariantDraft>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) }))

  const setControl = (index: number) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v, i) => ({ ...v, isControl: i === index })) }))

  const addVariant = () =>
    setDraft((d) => {
      const used = new Set(d.variants.map((v) => v.key))
      let n = 0
      let letter = 'a'
      while (used.has(`variant_${letter}`)) {
        n++
        letter = n < 26 ? String.fromCharCode(97 + n) : String(n)
      }
      return {
        ...d,
        variants: [
          ...d.variants,
          {
            uid: uid(),
            key: `variant_${letter}`,
            name: `Variant ${letter.toUpperCase()}`,
            value: flagType === 'BOOLEAN' ? 'true' : '',
            weight: '0',
            isControl: false,
          },
        ],
      }
    })

  const removeVariant = (index: number) =>
    setDraft((d) => {
      const removed = d.variants[index]
      const rest = d.variants.filter((_, i) => i !== index)
      // Keep exactly one control
      if (removed?.isControl && rest.length > 0) rest[0] = { ...rest[0], isControl: true }
      return { ...d, variants: rest }
    })

  const distributeEvenly = () =>
    setDraft((d) => {
      const count = d.variants.length
      const base = Math.floor(100 / count)
      const remainder = 100 - base * count
      return { ...d, variants: d.variants.map((v, i) => ({ ...v, weight: String(base + (i < remainder ? 1 : 0)) })) }
    })

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    const found = validateDraft(draft, flagType)
    if (Object.keys(found).length > 0) {
      // Focus the first invalid control after the errors have rendered
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setIsSubmitting(true)
    try {
      const created = await experimentsApi.create({
        name: draft.name.trim(),
        key: draft.key.trim(),
        description: draft.description.trim() || undefined,
        hypothesis: draft.hypothesis.trim() || undefined,
        flagId: draft.flagId,
        environmentId: draft.environmentId,
        trafficPercent: Number(draft.trafficPercent),
        variants: draft.variants.map((v) => ({
          key: v.key.trim(),
          name: v.name.trim(),
          value: v.value,
          weight: Number(v.weight),
          isControl: v.isControl,
        })),
      })
      toast.success(t('experiments-page.toast.created', { name: created.name ?? draft.name }))
      navigate(experimentPath(projectId, created.id))
    } catch (e: unknown) {
      toast.error(getErrorMessage(e))
    } finally {
      setIsSubmitting(false)
    }
  }

  const header = (
    <PageHeader
      breadcrumb={[
        { label: t('experiments-page.title'), to: listPath },
        { label: t('experiments-page.form.title') },
      ]}
      title={t('experiments-page.form.title')}
      description={t('experiments-page.form.subtitle')}
    />
  )

  if (optionsLoading || roleLoading) {
    return (
      <div role="status" aria-busy="true" aria-label={t('common.loading')} className="mx-auto max-w-5xl space-y-6">
        {header}
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {header}
        <EmptyState title={t('experiments-page.forbidden-title')} description={t('experiments-page.read-only')} />
      </div>
    )
  }

  if (optionsError) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {header}
        <ErrorState message={t('experiments-page.form.options-error')} onRetry={loadOptions} />
      </div>
    )
  }

  const total = weightTotal(draft.variants)
  const variantsError = err('variants')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {header}

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-6">
        <div>
          <FormSection
            title={t('experiments-page.form.general-title')}
            description={t('experiments-page.form.general-text')}
          >
            <Field id="exp-name" label={t('experiments-page.form.name')} error={err('name')}>
              <Input
                id="exp-name"
                value={draft.name}
                maxLength={LIMITS.name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('experiments-page.form.name-placeholder')}
                className={INVALID}
                {...fieldAria('exp-name', err('name'))}
              />
            </Field>
            <Field
              id="exp-key"
              label={t('experiments-page.form.key')}
              hint={t('experiments-page.form.key-hint')}
              error={err('key')}
            >
              <Input
                id="exp-key"
                value={draft.key}
                maxLength={LIMITS.key}
                onChange={(e) => {
                  setKeyEdited(true)
                  update('key', e.target.value)
                }}
                className={cn('font-mono', INVALID)}
                {...fieldAria('exp-key', err('key'), true)}
              />
            </Field>
            <Field id="exp-description" label={t('experiments-page.form.description')} error={err('description')}>
              <textarea
                id="exp-description"
                rows={2}
                value={draft.description}
                maxLength={LIMITS.text}
                onChange={(e) => update('description', e.target.value)}
                className={TEXTAREA}
                {...fieldAria('exp-description', err('description'))}
              />
            </Field>
            <Field
              id="exp-hypothesis"
              label={t('experiments-page.form.hypothesis')}
              hint={t('experiments-page.form.hypothesis-hint')}
              error={err('hypothesis')}
            >
              <textarea
                id="exp-hypothesis"
                rows={3}
                value={draft.hypothesis}
                maxLength={LIMITS.text}
                onChange={(e) => update('hypothesis', e.target.value)}
                placeholder={t('experiments-page.form.hypothesis-placeholder')}
                className={TEXTAREA}
                {...fieldAria('exp-hypothesis', err('hypothesis'), true)}
              />
            </Field>
          </FormSection>

          <FormSection
            title={t('experiments-page.form.targeting-title')}
            description={t('experiments-page.form.targeting-text')}
          >
            <Field id="exp-flag" label={t('experiments-page.form.flag')} error={err('flagId')}>
              {flags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('experiments-page.form.no-flags')}{' '}
                  <Link to={projectPath(projectId, 'flags')} className="text-foreground underline">
                    {t('experiments-page.form.to-flags')}
                  </Link>
                </p>
              ) : (
                <Select value={draft.flagId} onValueChange={setFlag}>
                  <SelectTrigger id="exp-flag" className={INVALID} {...fieldAria('exp-flag', err('flagId'))}>
                    <SelectValue placeholder={t('experiments-page.form.flag-placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {flags.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name} <span className="font-mono text-xs text-muted-foreground">({f.key})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field id="exp-environment" label={t('experiments-page.form.environment')} error={err('environmentId')}>
              <Select value={draft.environmentId} onValueChange={(value) => update('environmentId', value)}>
                <SelectTrigger
                  id="exp-environment"
                  className={INVALID}
                  {...fieldAria('exp-environment', err('environmentId'))}
                >
                  <SelectValue placeholder={t('experiments-page.form.environment-placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {environments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="exp-traffic"
              label={t('experiments-page.form.traffic')}
              hint={t('experiments-page.form.traffic-hint')}
              error={err('trafficPercent')}
            >
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={Number(draft.trafficPercent) || 1}
                  onChange={(e) => update('trafficPercent', e.target.value)}
                  className="h-2 flex-1 accent-primary"
                  aria-label={t('experiments-page.form.traffic')}
                  tabIndex={-1}
                />
                <div className="relative w-24">
                  <Input
                    id="exp-traffic"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={draft.trafficPercent}
                    onChange={(e) => update('trafficPercent', e.target.value)}
                    className={cn('pr-7 tabular-nums', INVALID)}
                    {...fieldAria('exp-traffic', err('trafficPercent'), true)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </Field>
          </FormSection>

          <FormSection
            title={t('experiments-page.form.variants-title')}
            description={t('experiments-page.form.variants-text')}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                className={cn('text-sm tabular-nums', total === 100 ? 'text-muted-foreground' : 'text-destructive')}
                aria-live="polite"
              >
                {t('experiments-page.form.weight-total', { total })}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={distributeEvenly}>
                  <Scale className="mr-2 h-3.5 w-3.5" />
                  {t('experiments-page.form.distribute')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addVariant}
                  disabled={draft.variants.length >= LIMITS.variants}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {t('experiments-page.form.add-variant')}
                </Button>
              </div>
            </div>

            {variantsError && (
              <p role="alert" className="text-sm text-destructive">
                {variantsError}
              </p>
            )}

            <ul className="space-y-3">
              {draft.variants.map((v, i) => {
                const prefix = `variant-${i}`
                const label = v.name || v.key || String(i + 1)
                return (
                  <li key={v.uid} className="rounded-lg border bg-card p-3">
                    <fieldset className="space-y-3">
                      <legend className="sr-only">{t('experiments-page.form.variant-legend', { name: label })}</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field id={`${prefix}-name`} label={t('experiments-page.form.variant-name')} error={err(`${prefix}-name`)}>
                          <Input
                            id={`${prefix}-name`}
                            value={v.name}
                            maxLength={LIMITS.name}
                            onChange={(e) => updateVariant(i, { name: e.target.value })}
                            className={cn('h-9', INVALID)}
                            {...fieldAria(`${prefix}-name`, err(`${prefix}-name`))}
                          />
                        </Field>
                        <Field id={`${prefix}-key`} label={t('experiments-page.form.variant-key')} error={err(`${prefix}-key`)}>
                          <Input
                            id={`${prefix}-key`}
                            value={v.key}
                            maxLength={LIMITS.key}
                            onChange={(e) => updateVariant(i, { key: e.target.value })}
                            className={cn('h-9 font-mono', INVALID)}
                            {...fieldAria(`${prefix}-key`, err(`${prefix}-key`))}
                          />
                        </Field>
                        <Field
                          id={`${prefix}-value`}
                          label={t('experiments-page.form.variant-value')}
                          error={err(`${prefix}-value`)}
                        >
                          {flagType === 'BOOLEAN' ? (
                            <Select value={v.value} onValueChange={(value) => updateVariant(i, { value })}>
                              <SelectTrigger
                                id={`${prefix}-value`}
                                className={cn('h-9', INVALID)}
                                {...fieldAria(`${prefix}-value`, err(`${prefix}-value`))}
                              >
                                <SelectValue placeholder="true / false" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">true</SelectItem>
                                <SelectItem value="false">false</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={`${prefix}-value`}
                              value={v.value}
                              onChange={(e) => updateVariant(i, { value: e.target.value })}
                              placeholder={flagType === 'JSON' ? '{ }' : undefined}
                              className={cn('h-9 font-mono', INVALID)}
                              {...fieldAria(`${prefix}-value`, err(`${prefix}-value`))}
                            />
                          )}
                        </Field>
                        <Field
                          id={`${prefix}-weight`}
                          label={t('experiments-page.form.variant-weight')}
                          error={err(`${prefix}-weight`)}
                        >
                          <Input
                            id={`${prefix}-weight`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            value={v.weight}
                            onChange={(e) => updateVariant(i, { weight: e.target.value })}
                            className={cn('h-9 tabular-nums', INVALID)}
                            {...fieldAria(`${prefix}-weight`, err(`${prefix}-weight`))}
                          />
                        </Field>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="control-variant"
                            checked={v.isControl}
                            onChange={() => setControl(i)}
                            className="h-4 w-4 accent-primary"
                          />
                          {t('experiments-page.form.is-control')}
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeVariant(i)}
                          disabled={draft.variants.length <= 2}
                          aria-label={t('experiments-page.form.remove-variant', { name: label })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </fieldset>
                  </li>
                )
              })}
            </ul>
          </FormSection>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => navigate(listPath)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('experiments-page.form.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}
