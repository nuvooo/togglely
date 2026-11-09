import { FlaskConical, Lock, Plus, SearchX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { RoleUnavailableNotice } from '@/components/feedback/RoleUnavailableNotice'
import { PageHeader } from '@/components/page/PageHeader'
import { PageToolbar } from '@/components/page/PageToolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getErrorStatus } from '@/lib/errors'
import { experimentPath, projectPath } from '@/lib/routes'
import { EXPERIMENT_STATUSES, type Experiment, type ExperimentStatus, experimentsApi } from './components/api'
import { ExperimentActionsMenu } from './components/ExperimentActionsMenu'
import { ExperimentStatusBadge } from './components/ExperimentStatusBadge'
import { useExperimentPermissions, useExperimentProjectId } from './components/hooks'
import { useExperimentCommands } from './components/useExperimentCommands'

type LoadError = 'forbidden' | 'failed' | null
type StatusFilter = 'all' | ExperimentStatus

const parseStatus = (value: string | null): StatusFilter => {
  const upper = (value ?? '').toUpperCase()
  return (EXPERIMENT_STATUSES as readonly string[]).includes(upper) ? (upper as ExperimentStatus) : 'all'
}

export default function ExperimentsList() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const projectId = useExperimentProjectId()
  const { canEdit, canDelete, roleLoading, roleUnavailable } = useExperimentPermissions(projectId)
  const [searchParams, setSearchParams] = useSearchParams()
  const status = parseStatus(searchParams.get('status'))
  const [query, setQuery] = useState('')
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<LoadError>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setExperiments(await experimentsApi.list(projectId))
    } catch (err: unknown) {
      setLoadError(getErrorStatus(err) === 403 ? 'forbidden' : 'failed')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  const { request, busyId, dialog } = useExperimentCommands({
    onUpdated: (updated) => setExperiments((list) => list.map((e) => (e.id === updated.id ? updated : e))),
    onDeleted: (deleted) => setExperiments((list) => list.filter((e) => e.id !== deleted.id)),
  })

  const setStatus = (id: string) => {
    const next = new URLSearchParams(searchParams)
    if (id === 'all' || id === status) next.delete('status')
    else next.set('status', id.toLowerCase())
    setSearchParams(next, { replace: true })
  }

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: experiments.length }
    for (const e of experiments) result[e.status] = (result[e.status] ?? 0) + 1
    return result
  }, [experiments])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return experiments.filter(
      (e) =>
        (status === 'all' || e.status === status) &&
        (!q ||
          e.name.toLowerCase().includes(q) ||
          e.key.toLowerCase().includes(q) ||
          (e.flag?.name ?? '').toLowerCase().includes(q) ||
          (e.flag?.key ?? '').toLowerCase().includes(q))
    )
  }, [experiments, status, query])

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(i18n.language, { dateStyle: 'medium' }) : '–'

  const columns: DataTableColumn<Experiment>[] = [
    {
      key: 'name',
      header: t('experiments-page.col.name'),
      className: 'max-w-[16rem]',
      cell: (e) => (
        <>
          <Link
            to={experimentPath(projectId, e.id)}
            className="block truncate font-medium text-foreground hover:underline"
          >
            {e.name}
          </Link>
          <p className="truncate font-mono text-xs text-muted-foreground">{e.key}</p>
        </>
      ),
    },
    {
      key: 'flag',
      header: t('experiments-page.col.flag'),
      hideBelow: 'md',
      className: 'max-w-[12rem]',
      cell: (e) =>
        e.flag ? (
          <>
            <span className="block truncate">{e.flag.name}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">{e.flag.key}</span>
          </>
        ) : (
          '–'
        ),
    },
    {
      key: 'environment',
      header: t('experiments-page.col.environment'),
      hideBelow: 'lg',
      cell: (e) => (e.environment ? <Badge variant="outline">{e.environment.name}</Badge> : '–'),
    },
    {
      key: 'status',
      header: t('experiments-page.col.status'),
      cell: (e) => <ExperimentStatusBadge status={e.status} />,
    },
    {
      key: 'variants',
      header: t('experiments-page.col.variants'),
      align: 'right',
      hideBelow: 'sm',
      className: 'tabular-nums',
      cell: (e) => e.variants?.length ?? 0,
    },
    {
      key: 'started',
      header: t('experiments-page.col.started'),
      hideBelow: 'md',
      className: 'whitespace-nowrap text-xs tabular-nums text-muted-foreground',
      cell: (e) => formatDate(e.startedAt),
    },
  ]
  if (!roleLoading) {
    columns.push({
      key: 'actions',
      header: t('experiments-page.col.actions'),
      srOnlyHeader: true,
      width: '3rem',
      align: 'right',
      className: 'px-2',
      cell: (e) => (
        <ExperimentActionsMenu
          experiment={e}
          detailPath={experimentPath(projectId, e.id)}
          canEdit={canEdit}
          canDelete={canDelete}
          busy={busyId === e.id}
          onCommand={request}
        />
      ),
    })
  }

  const createButton = canEdit ? (
    <Button asChild>
      <Link to={`${projectPath(projectId, 'experiments')}/new`}>
        <Plus className="mr-2 h-4 w-4" />
        {t('experiments-page.create')}
      </Link>
    </Button>
  ) : undefined

  const loading = isLoading || roleLoading
  let content: React.ReactNode
  if (loading) {
    content = <DataTable columns={columns} rows={[]} getRowId={(e) => e.id} loading loadingRows={4} />
  } else if (loadError === 'forbidden') {
    content = (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title={t('experiments-page.forbidden-title')}
        description={t('experiments-page.forbidden-text')}
      />
    )
  } else if (loadError) {
    content = <ErrorState message={t('experiments-page.load-error')} onRetry={load} />
  } else if (experiments.length === 0) {
    content = (
      <EmptyState
        icon={<FlaskConical className="h-5 w-5" />}
        title={t('experiments-page.empty-title')}
        description={t('experiments-page.empty-text')}
        action={
          createButton ?? <p className="text-xs text-muted-foreground">{t('experiments-page.read-only')}</p>
        }
      />
    )
  } else {
    content = (
      <div className="space-y-3">
        <PageToolbar
          onSearch={setQuery}
          searchPlaceholder={t('experiments-page.search')}
          filters={(['all', ...EXPERIMENT_STATUSES] as StatusFilter[])
            .filter((s) => s === 'all' || s === status || counts[s])
            .map((s) => ({
              id: s,
              label: s === 'all' ? t('experiments-page.filter.all') : t(`experiments-page.status.${s.toLowerCase()}`),
              count: counts[s] ?? 0,
              active: s === status,
            }))}
          onFilterChange={setStatus}
        />
        <DataTable
          columns={columns}
          rows={visible}
          getRowId={(e) => e.id}
          onRowClick={(e) => navigate(experimentPath(projectId, e.id))}
          label={t('experiments-page.title')}
          empty={
            <EmptyState
              bordered={false}
              icon={<SearchX className="h-5 w-5" />}
              title={t('experiments-page.no-match-title')}
              description={t('experiments-page.no-match-text')}
            />
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t('experiments-page.title')}
        description={t('experiments-page.subtitle')}
        actions={!loading && !loadError && experiments.length > 0 ? createButton : undefined}
      />
      <RoleUnavailableNotice show={roleUnavailable} />
      {content}
      {dialog}
    </div>
  )
}
