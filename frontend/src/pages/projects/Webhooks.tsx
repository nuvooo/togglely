import { Lock, Plus, Webhook as WebhookIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageHeader } from '@/components/page/PageHeader'
import { useCanManageWebhooks } from '@/components/webhooks/useCanManageWebhooks'
import { WebhookActions } from '@/components/webhooks/WebhookActions'
import { WebhookFormDialog } from '@/components/webhooks/WebhookFormDialog'
import { WebhookSecretDialog } from '@/components/webhooks/WebhookSecretDialog'
import { WebhookEnvironments, WebhookStatus } from '@/components/webhooks/WebhookStatus'
import { Button } from '@/components/ui/button'
import { getErrorStatus } from '@/lib/errors'
import { webhookPath } from '@/lib/routes'
import { type ProjectEnvironment, type Webhook, webhooksApi } from '@/lib/webhooks'

type LoadError = 'forbidden' | 'failed' | null

export default function Webhooks() {
  const { t, i18n } = useTranslation()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const { canManage, roleLoading } = useCanManageWebhooks(projectId)
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [environments, setEnvironments] = useState<ProjectEnvironment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<LoadError>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [list, envs] = await Promise.all([
        webhooksApi.list(projectId),
        // Environment names are only labels: the list works without them
        webhooksApi.environments(projectId).catch(() => [] as ProjectEnvironment[]),
      ])
      setWebhooks(list)
      setEnvironments(envs)
    } catch (err: unknown) {
      setLoadError(getErrorStatus(err) === 403 ? 'forbidden' : 'failed')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  /** Silent reload (no skeleton), e.g. to pick up the last delivery after a test. */
  const refresh = () => {
    webhooksApi
      .list(projectId)
      .then(setWebhooks)
      .catch(() => {})
  }

  const replace = (updated: Webhook) => setWebhooks((list) => list.map((w) => (w.id === updated.id ? updated : w)))

  const loading = isLoading || roleLoading

  const columns: DataTableColumn<Webhook>[] = [
    {
      key: 'url',
      header: t('webhooks.col-url'),
      className: 'max-w-[16rem] sm:max-w-xs',
      cell: (webhook) => (
        <>
          <Link
            to={webhookPath(projectId, webhook.id)}
            className="block truncate font-mono text-xs text-foreground hover:underline"
            title={webhook.url}
          >
            {webhook.url}
          </Link>
          {webhook.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{webhook.description}</p>}
        </>
      ),
    },
    {
      key: 'environments',
      header: t('webhooks.col-environments'),
      hideBelow: 'sm',
      cell: (webhook) => <WebhookEnvironments webhook={webhook} environments={environments} />,
    },
    {
      key: 'status',
      header: t('webhooks.col-status'),
      cell: (webhook) => <WebhookStatus webhook={webhook} />,
    },
    {
      key: 'last-delivery',
      header: t('webhooks.col-last-delivery'),
      hideBelow: 'md',
      className: 'whitespace-nowrap text-xs tabular-nums text-muted-foreground',
      cell: (webhook) =>
        webhook.lastDeliveryAt ? new Date(webhook.lastDeliveryAt).toLocaleString(i18n.language) : '–',
    },
  ]
  if (canManage && !loading) {
    columns.push({
      key: 'actions',
      header: t('webhooks.col-actions'),
      srOnlyHeader: true,
      width: '3rem',
      align: 'right',
      className: 'px-2',
      cell: (webhook) => (
        <WebhookActions
          projectId={projectId}
          webhook={webhook}
          environments={environments}
          onUpdated={replace}
          onDeleted={(deleted) => setWebhooks((list) => list.filter((w) => w.id !== deleted.id))}
          onDelivery={refresh}
        />
      ),
    })
  }

  const addButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="mr-2 h-4 w-4" />
      {t('webhooks.add')}
    </Button>
  )

  let content: React.ReactNode
  if (loading) {
    content = <DataTable columns={columns} rows={[]} getRowId={(w) => w.id} loading loadingRows={3} />
  } else if (loadError === 'forbidden') {
    content = (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title={t('webhooks.forbidden-title')}
        description={t('webhooks.forbidden-text')}
      />
    )
  } else if (loadError) {
    content = <ErrorState message={t('webhooks.load-error')} onRetry={load} retryLabel={t('webhooks.retry')} />
  } else if (webhooks.length === 0) {
    content = (
      <EmptyState
        icon={<WebhookIcon className="h-5 w-5" />}
        title={t('webhooks.empty-title')}
        description={t('webhooks.empty-text')}
        action={canManage ? addButton : <p className="text-xs text-muted-foreground">{t('webhooks.read-only')}</p>}
      />
    )
  } else {
    content = (
      <div className="space-y-2">
        {!canManage && (
          <p className="text-xs text-muted-foreground">
            {t('webhooks.read-only')} {t('webhooks.path-hidden')}
          </p>
        )}
        <DataTable columns={columns} rows={webhooks} getRowId={(w) => w.id} label={t('webhooks.title')} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('webhooks.title')}
        description={t('webhooks.subtitle')}
        actions={canManage && !loadError && !loading && webhooks.length > 0 ? addButton : undefined}
      />
      {content}

      <WebhookFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        environments={environments}
        onSaved={(created, plain) => {
          setWebhooks((list) => [...list, created])
          toast.success(t('webhooks.toast.created'))
          if (plain) setSecret(plain)
        }}
      />

      <WebhookSecretDialog secret={secret} reason="created" onClose={() => setSecret(null)} />
    </div>
  )
}
