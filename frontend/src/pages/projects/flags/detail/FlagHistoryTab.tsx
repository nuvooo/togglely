import { History } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import {
  type AuditLogEntry,
  filterFlagLogs,
  formatUser,
  summarizeChanges,
} from './history'

interface FlagHistoryTabProps {
  projectId: string
  flagId: string
}

/** Audit log entries of one flag (its own and those of its rules/brand values). */
export function FlagHistoryTab({ projectId, flagId }: FlagHistoryTabProps) {
  const { t, i18n } = useTranslation()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(`/audit-logs/project/${projectId}`, {
        params: { entityId: flagId, limit: 200 },
      })
      setLogs(filterFlagLogs(response.data?.auditLogs ?? [], flagId))
    } catch (err) {
      setLogs([])
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [projectId, flagId])

  useEffect(() => {
    void load()
  }, [load])

  const formatTime = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
  }

  const columns: DataTableColumn<AuditLogEntry>[] = [
    {
      key: 'time',
      header: t('flag-detail.history.time'),
      width: '11rem',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (log) => (
        <time dateTime={log.createdAt}>{formatTime(log.createdAt)}</time>
      ),
    },
    {
      key: 'user',
      header: t('flag-detail.history.user'),
      width: '12rem',
      hideBelow: 'sm',
      cell: (log) =>
        formatUser(log.user) ?? (
          <span className="text-muted-foreground">
            {t('flag-detail.history.system')}
          </span>
        ),
    },
    {
      key: 'action',
      header: t('flag-detail.history.action'),
      width: '14rem',
      cell: (log) => (
        <Badge variant="neutral" className="font-mono">
          {log.action}
        </Badge>
      ),
    },
    {
      key: 'changes',
      header: t('flag-detail.history.changes'),
      hideBelow: 'md',
      cell: (log) => {
        const summary = summarizeChanges(log)
        return summary ? (
          <span
            className="line-clamp-2 break-all font-mono text-xs text-muted-foreground"
            title={summary}
          >
            {summary}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
  ]

  if (error) {
    return (
      <ErrorState
        title={t('flag-detail.history.load-error')}
        message={error}
        onRetry={() => void load()}
      />
    )
  }

  return (
    <div className="space-y-2">
      <DataTable
        label={t('flag-detail.history.title')}
        columns={columns}
        rows={logs}
        getRowId={(log) => log.id}
        loading={loading}
        loadingRows={3}
        empty={
          <EmptyState
            bordered={false}
            icon={<History className="h-5 w-5" />}
            title={t('flag-detail.history.empty-title')}
            description={t('flag-detail.history.empty-description')}
          />
        }
      />
      <p className="text-xs text-muted-foreground">
        {t('flag-detail.history.limit-hint')}
      </p>
    </div>
  )
}
