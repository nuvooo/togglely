import { FlaskConical, Loader2, Play, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageHeader } from '@/components/page/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { CodeBlock } from '@/components/webhooks/CodeBlock'
import api from '@/lib/axios'
import { orgPath } from '@/lib/routes'
import {
  buildSdkSnippet,
  fetchBrandMatrix,
  type SdkContext,
} from '@/lib/sdk-tester'
import { fetchProject, type ProjectDetails } from '../settings/project'
import { type Matrix, ResultsMatrix } from './ResultsMatrix'

interface Brand {
  id: string
  key: string
  name: string
}

interface ContextAttr {
  id: number
  key: string
  value: string
}

let nextAttrId = 1
const newAttr = (key = ''): ContextAttr => ({
  id: nextAttrId++,
  key,
  value: '',
})

/** Attribute values are typed like an app would send them: booleans, numbers, strings. */
function buildContext(attrs: ContextAttr[]): SdkContext {
  const context: SdkContext = {}
  for (const { key, value } of attrs) {
    // The brand is chosen per column; never send it as a plain attribute.
    if (!key.trim() || value === '' || key === 'brandKey' || key === 'tenantId')
      continue
    if (value === 'true') context[key] = true
    else if (value === 'false') context[key] = false
    else if (!Number.isNaN(Number(value))) context[key] = Number(value)
    else context[key] = value
  }
  return context
}

/** Evaluates the project's flags through the public SDK endpoint, per brand for MULTI projects. */
export default function SdkTesterPage() {
  const { t } = useTranslation()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [brands, setBrands] = useState<Brand[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [environmentId, setEnvironmentId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [attrs, setAttrs] = useState<ContextAttr[]>(() => [newAttr('userId')])

  const [running, setRunning] = useState(false)
  const [matrix, setMatrix] = useState<Matrix | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Flag/brand shown in the generated code (defaults: first flag, no brand)
  const [snippetFlagKey, setSnippetFlagKey] = useState<string | null>(null)
  const [snippetBrandKey, setSnippetBrandKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(false)
    // The route stays mounted when switching projects; drop the previous project's state.
    setMatrix(null)
    setError(null)
    setSnippetFlagKey(null)
    setSnippetBrandKey(null)
    setBrands([])
    try {
      const loaded = await fetchProject(projectId)
      setProject(loaded)
      setEnvironmentId(loaded.environments?.[0]?.id ?? '')
      if (loaded.type === 'MULTI') {
        // Multi-brand projects are evaluated once per brand
        try {
          const response = await api.get(`/brands/project/${projectId}`)
          setBrands(response.data.brands ?? [])
        } catch {
          setError(t('sdk-tester.errors.brands'))
        }
      }
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, t])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  const environments = project?.environments ?? []
  const isMultiBrand = project?.type === 'MULTI'
  const environmentKey =
    environments.find((e) => e.id === environmentId)?.key || 'development'
  const context = buildContext(attrs)
  const snippetRow =
    matrix?.rows.find((r) => r.flagKey === snippetFlagKey) ??
    matrix?.rows[0] ??
    null

  const code = buildSdkSnippet({
    apiKey,
    projectKey: project?.key || 'your-project',
    environmentKey,
    // Production serves /sdk on the same origin (nginx); in development
    // Vite proxies /sdk to the backend.
    baseUrl: window.location.origin,
    context,
    brandKey: snippetBrandKey ?? undefined,
    flag: snippetRow
      ? { key: snippetRow.flagKey, flagType: snippetRow.flagType }
      : null,
  })

  const updateAttr = (id: number, field: 'key' | 'value', value: string) =>
    setAttrs((list) =>
      list.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    )

  const runTest = async () => {
    if (!project || !environmentId) {
      setError(t('sdk-tester.errors.environment'))
      return
    }
    if (!apiKey.trim()) {
      setError(t('sdk-tester.errors.api-key'))
      return
    }
    setRunning(true)
    setError(null)
    setMatrix(null)
    try {
      const result = await fetchBrandMatrix({
        projectKey: project.key,
        environmentKey,
        apiKey: apiKey.trim(),
        context,
        brands: isMultiBrand ? brands : [],
      })
      const failed = Object.values(result.errors)
      if (result.rows.length === 0 && failed.length > 0) {
        // Every request failed (e.g. wrong API key): show the reason
        setError(failed[0])
      } else {
        setMatrix(result)
        if (result.rows.length === 0) setError(t('sdk-tester.errors.no-flags'))
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('sdk-tester.errors.failed')
      )
    } finally {
      setRunning(false)
    }
  }

  const header = (
    <PageHeader
      title={t('sdk-tester.title')}
      description={t('sdk-tester.subtitle')}
    />
  )

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6" aria-busy="true">
        {header}
        <span role="status" className="sr-only">
          {t('common.loading')}
        </span>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (loadError || !project) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {header}
        <ErrorState message={t('sdk-tester.load-error')} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {header}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* Configuration */}
        <section
          aria-labelledby="sdk-config"
          className="space-y-5 self-start rounded-lg border bg-card p-4 sm:p-5"
        >
          <h2 id="sdk-config" className="text-sm font-semibold">
            {t('sdk-tester.config')}
          </h2>

          <div className="space-y-2">
            <Label htmlFor="sdk-environment">
              {t('sdk-tester.environment')}
            </Label>
            <Select
              value={environmentId}
              onValueChange={setEnvironmentId}
              disabled={environments.length === 0}
            >
              <SelectTrigger id="sdk-environment">
                <SelectValue
                  placeholder={t('sdk-tester.environment-placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sdk-api-key">{t('sdk-tester.api-key')}</Label>
            <Input
              id="sdk-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="tk_..."
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t('sdk-tester.api-key-hint')}{' '}
              <Link
                to={orgPath(project.organizationId, 'api-keys')}
                className="text-primary hover:underline"
              >
                {t('sdk-tester.api-key-link')}
              </Link>
            </p>
          </div>

          <section
            aria-labelledby="sdk-context"
            className="space-y-2 border-t pt-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="sdk-context" className="text-sm font-medium">
                {t('sdk-tester.context')}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setAttrs((list) => [...list, newAttr()])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t('sdk-tester.add-attribute')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('sdk-tester.context-hint')}
              {isMultiBrand &&
                ` ${t('sdk-tester.brands-hint', { count: brands.length })}`}
            </p>
            <div className="space-y-2">
              {attrs.map((attr, index) => (
                <div key={attr.id} className="flex items-center gap-2">
                  <Input
                    value={attr.key}
                    onChange={(e) => updateAttr(attr.id, 'key', e.target.value)}
                    placeholder={t('sdk-tester.attribute-name')}
                    aria-label={t('sdk-tester.attribute-name-label', {
                      index: index + 1,
                    })}
                    className="h-8 font-mono text-xs"
                  />
                  <Input
                    value={attr.value}
                    onChange={(e) =>
                      updateAttr(attr.id, 'value', e.target.value)
                    }
                    placeholder={t('sdk-tester.attribute-value')}
                    aria-label={t('sdk-tester.attribute-value-label', {
                      index: index + 1,
                    })}
                    className="h-8 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={t('sdk-tester.remove-attribute', {
                      index: index + 1,
                    })}
                    onClick={() =>
                      setAttrs((list) => list.filter((a) => a.id !== attr.id))
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <Button
            className="w-full"
            onClick={runTest}
            disabled={running || !environmentId || !apiKey.trim()}
          >
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {running ? t('sdk-tester.running') : t('sdk-tester.run')}
          </Button>

          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </section>

        {/* Results + generated code */}
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="sdk-results" className="space-y-2">
            <div>
              <h2 id="sdk-results" className="text-sm font-semibold">
                {t('sdk-tester.results.title')}
              </h2>
              {matrix && matrix.rows.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {isMultiBrand
                    ? t('sdk-tester.results.hint-brand')
                    : t('sdk-tester.results.hint')}
                </p>
              )}
            </div>
            {matrix && matrix.rows.length > 0 ? (
              <ResultsMatrix
                matrix={matrix}
                selected={{
                  flagKey: snippetRow?.flagKey ?? null,
                  brandKey: snippetBrandKey,
                }}
                onSelect={(flagKey, brandKey) => {
                  setSnippetFlagKey(flagKey)
                  setSnippetBrandKey(brandKey)
                }}
              />
            ) : (
              <EmptyState
                icon={<FlaskConical className="h-5 w-5" />}
                title={t('sdk-tester.results.empty-title')}
                description={t('sdk-tester.results.empty-text')}
              />
            )}
          </section>

          <section aria-labelledby="sdk-code" className="space-y-2">
            <h2 id="sdk-code" className="text-sm font-semibold">
              {t('sdk-tester.code')}
            </h2>
            <CodeBlock code={code} label={t('sdk-tester.code')} />
          </section>
        </div>
      </div>
    </div>
  )
}
