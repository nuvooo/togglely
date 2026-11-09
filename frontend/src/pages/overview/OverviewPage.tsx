import {
  Building2,
  Flag,
  FlaskConical,
  FolderKanban,
  Plus,
  Power,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageHeader } from '@/components/page/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { flagPath, projectPath, ROUTES } from '@/lib/routes'
import { formatRelative } from '@/pages/projects/flags/flagsFilter'
import {
  type OverviewData,
  type OverviewProject,
  useOverview,
} from './overview'

function RelativeTime({ date }: { date: string }) {
  const { i18n } = useTranslation()
  const relative = formatRelative(date, i18n.language)
  if (!relative) return <>–</>
  return (
    <time dateTime={date} title={new Date(date).toLocaleString(i18n.language)}>
      {relative}
    </time>
  )
}

function KpiTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon: ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <dt className="text-xs font-medium uppercase tracking-wider">
          {label}
        </dt>
        <span aria-hidden="true">{icon}</span>
      </div>
      <dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function KpiTiles({ counts }: { counts: OverviewData['counts'] }) {
  const { t } = useTranslation()
  const noProduction = counts.flagsEnabledInProduction === null
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiTile
        label={t('overview-page.kpi.organizations')}
        value={counts.organizations}
        icon={<Building2 className="h-4 w-4" />}
      />
      <KpiTile
        label={t('overview-page.kpi.projects')}
        value={counts.projects}
        icon={<FolderKanban className="h-4 w-4" />}
      />
      <KpiTile
        label={t('overview-page.kpi.flags')}
        value={counts.flags}
        icon={<Flag className="h-4 w-4" />}
      />
      <KpiTile
        label={t('overview-page.kpi.enabled-in-production')}
        value={noProduction ? '–' : counts.flagsEnabledInProduction}
        hint={noProduction ? t('overview-page.kpi.no-production') : undefined}
        icon={<Power className="h-4 w-4" />}
      />
      <KpiTile
        label={t('overview-page.kpi.running-experiments')}
        value={counts.runningExperiments}
        icon={<FlaskConical className="h-4 w-4" />}
      />
    </dl>
  )
}

function LoadingState() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6" aria-busy="true">
      <span role="status" className="sr-only">
        {t('common.loading')}
      </span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[5.5rem] w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}

function RecentFlags({ data }: { data: OverviewData }) {
  const { t } = useTranslation()
  const projectNames = new Map(data.projects.map((p) => [p.id, p.name]))
  return (
    <section aria-labelledby="overview-recent" className="space-y-3">
      <h2 id="overview-recent" className="text-sm font-semibold">
        {t('overview-page.recent-title')}
      </h2>
      {data.recentFlags.length === 0 ? (
        <EmptyState
          icon={<Flag className="h-5 w-5" />}
          title={t('overview-page.recent-empty')}
          description={t('overview-page.recent-empty-hint')}
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {data.recentFlags.map((flag) => (
            <li key={flag.id}>
              <Link
                to={flagPath(flag.projectId, flag.id)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {flag.name}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {projectNames.get(flag.projectId) ?? ''} · {flag.key}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  <RelativeTime date={flag.updatedAt} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ProjectsTable({ data }: { data: OverviewData }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const columns: DataTableColumn<OverviewProject>[] = [
    {
      key: 'name',
      header: t('overview-page.col-project'),
      cell: (p) => (
        <Link
          to={projectPath(p.id)}
          className="block min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block truncate font-medium">{p.name}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {p.key}
          </span>
        </Link>
      ),
    },
    {
      key: 'org',
      header: t('overview-page.col-organization'),
      hideBelow: 'sm',
      className: 'text-muted-foreground',
      cell: (p) => <span className="block truncate">{p.organizationName}</span>,
    },
    {
      key: 'type',
      header: t('overview-page.col-type'),
      hideBelow: 'md',
      cell: (p) =>
        p.type === 'MULTI' ? (
          <Badge variant="neutral">{t('flags-page.multi-badge')}</Badge>
        ) : (
          <Badge variant="outline">{t('overview-page.type-single')}</Badge>
        ),
    },
    {
      key: 'environments',
      header: t('overview-page.col-environments'),
      align: 'right',
      hideBelow: 'lg',
      className: 'tabular-nums',
      cell: (p) => p.environmentCount,
    },
    {
      key: 'flags',
      header: t('overview-page.col-flags'),
      align: 'right',
      className: 'tabular-nums',
      cell: (p) => p.flagCount,
    },
    {
      key: 'updated',
      header: t('overview-page.col-updated'),
      hideBelow: 'md',
      className: 'whitespace-nowrap text-xs text-muted-foreground',
      cell: (p) => <RelativeTime date={p.updatedAt} />,
    },
  ]

  return (
    <section aria-labelledby="overview-projects" className="space-y-3">
      <h2 id="overview-projects" className="text-sm font-semibold">
        {t('overview-page.projects-title')}
      </h2>
      <DataTable
        columns={columns}
        rows={data.projects}
        getRowId={(p) => p.id}
        onRowClick={(p) => navigate(projectPath(p.id))}
        rowFocusable={false}
        label={t('overview-page.projects-title')}
        empty={
          <EmptyState
            bordered={false}
            icon={<FolderKanban className="h-5 w-5" />}
            title={t('overview-page.projects-empty')}
            description={t('overview-page.projects-empty-hint')}
            action={
              <Button asChild size="sm" variant="outline">
                <Link to={ROUTES.orgs}>{t('overview-page.go-to-orgs')}</Link>
              </Button>
            }
          />
        }
      />
    </section>
  )
}

/** `/overview`: key figures, recently changed flags and all projects of the user. */
export default function OverviewPage() {
  const { t } = useTranslation()
  const { data, error, isLoading, reload } = useOverview()

  const newOrgButton = (
    <Button asChild variant="outline" size="sm">
      <Link to={ROUTES.newOrg}>
        <Plus className="mr-1.5 h-4 w-4" />
        {t('overview-page.new-organization')}
      </Link>
    </Button>
  )

  let content: ReactNode
  if (isLoading && !data) {
    content = <LoadingState />
  } else if (error || !data) {
    content = (
      <ErrorState message={t('overview-page.load-error')} onRetry={reload} />
    )
  } else if (data.counts.organizations === 0) {
    content = (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title={t('overview-page.no-orgs-title')}
        description={t('overview-page.no-orgs-text')}
        action={
          <Button asChild>
            <Link to={ROUTES.newOrg}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t('overview-page.create-org')}
            </Link>
          </Button>
        }
      />
    )
  } else {
    content = (
      <div className="space-y-8">
        <KpiTiles counts={data.counts} />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ProjectsTable data={data} />
          <RecentFlags data={data} />
        </div>
      </div>
    )
  }

  const hasOrgs = (data?.counts.organizations ?? 0) > 0
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={t('overview-page.title')}
        description={t('overview-page.description')}
        actions={hasOrgs ? newOrgButton : undefined}
      />
      {content}
    </div>
  )
}
