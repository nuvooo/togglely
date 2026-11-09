import { ChevronRight, History, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { type Member, memberName } from '@/components/members/types'
import { PageHeader } from '@/components/page/PageHeader'
import { Button } from '@/components/ui/button'
import api from '@/lib/axios'
import { projectPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace'
import {
  ACTION_FILTERS,
  type AuditLogFilters,
  appendPage,
  buildAuditParams,
  describeEntity,
  formatAction,
  formatActionFilter,
  formatAuditUser,
  formatValues,
  type OrgAuditLogEntry,
  type OrgAuditLogPage,
} from './auditLog'

const NO_FILTERS: AuditLogFilters = { projectId: '', userId: '', action: '' }

const SELECT_CLASS =
  'h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:max-w-[12rem]'

function ValuesBlock({ title, value }: { title: string; value: unknown }) {
  const { t } = useTranslation()
  const text = formatValues(value)
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {text ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-background p-2 font-mono text-xs">
          {text}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('org-pages.audit.no-values')}
        </p>
      )}
    </div>
  )
}

/** Organization audit log with filters, "load more" and expandable old/new values. */
export default function AuditLogPage() {
  const { t, i18n } = useTranslation()
  const { orgId = '' } = useParams<{ orgId: string }>()
  const { projectsByOrg } = useWorkspace()
  const projects = projectsByOrg(orgId)
  const [members, setMembers] = useState<Member[]>([])
  const [filters, setFilters] = useState<AuditLogFilters>(NO_FILTERS)
  const [logs, setLogs] = useState<OrgAuditLogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const loadId = useRef(0)

  const fetchPage = useCallback(
    async (before?: string | null): Promise<OrgAuditLogPage> => {
      const response = await api.get(`/audit-logs/organization/${orgId}`, {
        params: buildAuditParams(filters, before),
      })
      return {
        auditLogs: response.data.auditLogs ?? [],
        nextCursor: response.data.nextCursor ?? null,
      }
    },
    [orgId, filters]
  )

  const load = useCallback(async () => {
    const id = ++loadId.current
    setIsLoading(true)
    setLoadError(false)
    setMoreError(false)
    setExpanded(new Set())
    try {
      const page = await fetchPage()
      if (id !== loadId.current) return
      setLogs(page.auditLogs)
      setNextCursor(page.nextCursor)
    } catch {
      if (id === loadId.current) setLoadError(true)
    } finally {
      if (id === loadId.current) setIsLoading(false)
    }
  }, [fetchPage])

  useEffect(() => {
    if (orgId) load()
  }, [orgId, load])

  // Users for the filter; the log works without them.
  useEffect(() => {
    if (!orgId) return
    let active = true
    api
      .get(`/organizations/${orgId}/members`)
      .then((res) => active && setMembers(res.data.members ?? []))
      .catch(() => active && setMembers([]))
    return () => {
      active = false
    }
  }, [orgId])

  const loadMore = async () => {
    if (!nextCursor) return
    const id = loadId.current
    setLoadingMore(true)
    setMoreError(false)
    try {
      const page = await fetchPage(nextCursor)
      if (id !== loadId.current) return
      setLogs((current) => appendPage(current, page.auditLogs))
      setNextCursor(page.nextCursor)
    } catch {
      if (id === loadId.current) setMoreError(true)
    } finally {
      if (id === loadId.current) setLoadingMore(false)
    }
  }

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const setFilter = (name: keyof AuditLogFilters, value: string) =>
    setFilters((current) => ({ ...current, [name]: value }))

  const formatTime = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
  }

  const detailId = (log: OrgAuditLogEntry) => `audit-${log.id}-details`

  const columns: DataTableColumn<OrgAuditLogEntry>[] = [
    {
      key: 'toggle',
      header: t('org-pages.audit.col-details'),
      srOnlyHeader: true,
      width: '2.5rem',
      className: 'px-1',
      cell: (log) => {
        const open = expanded.has(log.id)
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-expanded={open}
            aria-controls={detailId(log)}
            aria-label={t(
              open
                ? 'org-pages.audit.hide-details'
                : 'org-pages.audit.show-details',
              {
                action: formatAction(log.action, t),
              }
            )}
            onClick={() => toggle(log.id)}
          >
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform',
                open && 'rotate-90'
              )}
            />
          </Button>
        )
      },
    },
    {
      key: 'time',
      header: t('org-pages.audit.col-time'),
      width: '10.5rem',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (log) => (
        <time dateTime={log.createdAt}>{formatTime(log.createdAt)}</time>
      ),
    },
    {
      key: 'user',
      header: t('org-pages.audit.col-user'),
      width: '11rem',
      hideBelow: 'md',
      cell: (log) => (
        <span className="block truncate">
          {formatAuditUser(log.user) ?? (
            <span className="text-muted-foreground">
              {t('org-pages.audit.system')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'action',
      header: t('org-pages.audit.col-action'),
      cell: (log) => (
        <span className="font-medium" title={log.action}>
          {formatAction(log.action, t)}
        </span>
      ),
    },
    {
      key: 'object',
      header: t('org-pages.audit.col-object'),
      hideBelow: 'sm',
      cell: (log) => (
        <div className="min-w-0">
          <p className="truncate">{describeEntity(log)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {log.entityType}
          </p>
        </div>
      ),
    },
    {
      key: 'project',
      header: t('org-pages.audit.col-project'),
      width: '10rem',
      hideBelow: 'lg',
      cell: (log) =>
        log.project ? (
          <Link
            to={projectPath(log.project.id)}
            className="block truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {log.project.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">–</span>
        ),
    },
  ]

  const filtered = Boolean(
    filters.projectId || filters.userId || filters.action
  )

  let content: React.ReactNode
  if (isLoading) {
    content = (
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(l) => l.id}
        loading
        loadingRows={6}
      />
    )
  } else if (loadError) {
    content = (
      <ErrorState message={t('org-pages.audit.load-error')} onRetry={load} />
    )
  } else if (logs.length === 0) {
    content = (
      <EmptyState
        icon={<History className="h-5 w-5" />}
        title={
          filtered
            ? t('org-pages.audit.no-results')
            : t('org-pages.audit.empty-title')
        }
        description={
          filtered
            ? t('org-pages.audit.no-results-text')
            : t('org-pages.audit.empty-text')
        }
        action={
          filtered ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilters(NO_FILTERS)}
            >
              {t('org-pages.audit.reset-filters')}
            </Button>
          ) : undefined
        }
      />
    )
  } else {
    content = (
      <div className="space-y-3">
        <DataTable
          columns={columns}
          rows={logs}
          getRowId={(l) => l.id}
          label={t('org-pages.audit.title')}
          renderExpanded={(log) => (
            <div className="grid gap-3 md:grid-cols-2">
              <ValuesBlock
                title={t('org-pages.audit.old-values')}
                value={log.oldValues}
              />
              <ValuesBlock
                title={t('org-pages.audit.new-values')}
                value={log.newValues}
              />
              <p className="text-xs text-muted-foreground md:col-span-2">
                <code className="font-mono">{log.action}</code> ·{' '}
                {log.entityType}{' '}
                <code className="font-mono">{log.entityId}</code>
              </p>
            </div>
          )}
          isExpanded={(log) => expanded.has(log.id)}
          getExpandedId={detailId}
        />
        {moreError && (
          <p role="alert" className="text-center text-sm text-destructive">
            {t('org-pages.audit.more-error')}
          </p>
        )}
        {nextCursor && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('org-pages.audit.load-more')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t('org-pages.audit.title')}
        description={t('org-pages.audit.subtitle')}
      />
      <fieldset className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <legend className="sr-only">{t('org-pages.audit.filters')}</legend>
        <select
          aria-label={t('org-pages.audit.filter-project')}
          value={filters.projectId}
          onChange={(e) => setFilter('projectId', e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">{t('org-pages.audit.all-projects')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('org-pages.audit.filter-user')}
          value={filters.userId}
          onChange={(e) => setFilter('userId', e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">{t('org-pages.audit.all-users')}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {memberName(m)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('org-pages.audit.filter-action')}
          value={filters.action}
          onChange={(e) => setFilter('action', e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">{t('org-pages.audit.all-actions')}</option>
          {ACTION_FILTERS.map((prefix) => (
            <option key={prefix} value={prefix}>
              {formatActionFilter(prefix, t)}
            </option>
          ))}
        </select>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters(NO_FILTERS)}
          >
            {t('org-pages.audit.reset-filters')}
          </Button>
        )}
      </fieldset>
      {content}
    </div>
  )
}
