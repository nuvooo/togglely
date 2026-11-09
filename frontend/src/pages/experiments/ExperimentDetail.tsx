import { FlaskConical, Lock, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageHeader } from '@/components/page/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getErrorStatus } from '@/lib/errors'
import { projectPath } from '@/lib/routes'
import { canDeleteStatus, type Experiment, type ExperimentResults, experimentsApi, lifecycleActions } from './components/api'
import { LIFECYCLE_ICON, lifecycleLabel } from './components/ExperimentActionsMenu'
import { ExperimentStatusBadge } from './components/ExperimentStatusBadge'
import { useExperimentPermissions, useExperimentProjectId } from './components/hooks'
import { OverviewPanel } from './components/OverviewPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { useExperimentCommands } from './components/useExperimentCommands'
import { VariantsPanel } from './components/VariantsPanel'

type LoadError = 'forbidden' | 'not-found' | 'failed' | null
const TABS = ['overview', 'variants', 'results'] as const
type Tab = (typeof TABS)[number]

export default function ExperimentDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id: routeId, experimentId } = useParams<{ id: string; experimentId: string }>()
  const id = routeId || experimentId || ''
  const projectId = useExperimentProjectId()
  const { canEdit, canDelete, roleLoading } = useExperimentPermissions(projectId)
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'overview'
  const listPath = projectPath(projectId, 'experiments')

  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<LoadError>(null)
  const [results, setResults] = useState<ExperimentResults | null>(null)
  const [resultsLoading, setResultsLoading] = useState(true)
  const [resultsError, setResultsError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setExperiment(await experimentsApi.get(id))
    } catch (err: unknown) {
      const status = getErrorStatus(err)
      setLoadError(status === 403 ? 'forbidden' : status === 404 || status === 400 ? 'not-found' : 'failed')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  const loadResults = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true)
      else setResultsLoading(true)
      setResultsError(false)
      try {
        setResults(await experimentsApi.results(id))
      } catch {
        setResultsError(true)
      } finally {
        setResultsLoading(false)
        setRefreshing(false)
      }
    },
    [id]
  )

  useEffect(() => {
    if (!id) return
    load()
    loadResults()
  }, [id, load, loadResults])

  const { request, busyId, dialog } = useExperimentCommands({
    onUpdated: (updated) => {
      setExperiment(updated)
      void loadResults(true)
    },
    onDeleted: () => navigate(listPath),
  })

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'overview') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  const breadcrumb = [{ label: t('experiments-page.title'), to: listPath }]

  if (isLoading) {
    return (
      <div role="status" aria-busy="true" aria-label={t('common.loading')} className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-96 max-w-full" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (loadError || !experiment) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader breadcrumb={breadcrumb} title={t('experiments-page.detail-title')} />
        {loadError === 'forbidden' ? (
          <EmptyState
            icon={<Lock className="h-5 w-5" />}
            title={t('experiments-page.forbidden-title')}
            description={t('experiments-page.forbidden-text')}
          />
        ) : loadError === 'failed' ? (
          <ErrorState message={t('experiments-page.detail-load-error')} onRetry={load} />
        ) : (
          <EmptyState
            icon={<FlaskConical className="h-5 w-5" />}
            title={t('experiments-page.not-found')}
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to={listPath}>{t('experiments-page.back')}</Link>
              </Button>
            }
          />
        )}
      </div>
    )
  }

  const busy = busyId === experiment.id
  const actions = canEdit && !roleLoading ? lifecycleActions(experiment.status) : []
  const deletable = canDelete && !roleLoading && canDeleteStatus(experiment.status)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        breadcrumb={[...breadcrumb, { label: experiment.name }]}
        title={experiment.name}
        meta={<ExperimentStatusBadge status={experiment.status} />}
        description={<code className="font-mono text-xs">{experiment.key}</code>}
        actions={
          actions.length > 0 || deletable ? (
            <>
              {deletable && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={busy}
                  onClick={() => request(experiment, 'delete')}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common.delete')}
                </Button>
              )}
              {actions.map((action) => {
                const Icon = LIFECYCLE_ICON[action]
                return (
                  <Button
                    key={action}
                    variant={action === 'start' ? 'default' : 'outline'}
                    disabled={busy}
                    onClick={() => request(experiment, action)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {lifecycleLabel(t, action, experiment)}
                  </Button>
                )
              })}
            </>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t('experiments-page.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="variants">
            {t('experiments-page.tabs.variants')}
            <span className="ml-1.5 tabular-nums text-muted-foreground">{experiment.variants.length}</span>
          </TabsTrigger>
          <TabsTrigger value="results">{t('experiments-page.tabs.results')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewPanel experiment={experiment} projectId={projectId} />
        </TabsContent>
        <TabsContent value="variants" className="mt-4">
          <VariantsPanel variants={experiment.variants} trafficPercent={experiment.trafficPercent} />
        </TabsContent>
        <TabsContent value="results" className="mt-4">
          <ResultsPanel
            status={experiment.status}
            results={results}
            loading={resultsLoading}
            error={resultsError}
            refreshing={refreshing}
            onRetry={() => loadResults()}
            onRefresh={() => loadResults(true)}
          />
        </TabsContent>
      </Tabs>

      {dialog}
    </div>
  )
}
