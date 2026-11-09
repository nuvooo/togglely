import { Lock, Plus, Webhook as WebhookIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useCanManageWebhooks } from '@/components/webhooks/useCanManageWebhooks'
import { WebhookActions } from '@/components/webhooks/WebhookActions'
import { WebhookFormDialog } from '@/components/webhooks/WebhookFormDialog'
import { WebhookSecretDialog } from '@/components/webhooks/WebhookSecretDialog'
import { WebhookEnvironments, WebhookStatus } from '@/components/webhooks/WebhookStatus'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorStatus } from '@/lib/errors'
import { webhookPath } from '@/lib/routes'
import { type ProjectEnvironment, type Webhook, webhooksApi } from '@/lib/webhooks'

type LoadError = 'forbidden' | 'failed' | null

/** Message box for empty, forbidden and error states. */
export function WebhooksNotice({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode
  title: string
  text?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</span>
      <p className="mt-3 font-medium">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-muted-foreground">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

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

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('webhooks.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('webhooks.subtitle')}</p>
      </div>
      {canManage && !loadError && !isLoading && !roleLoading && webhooks.length > 0 && (
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('webhooks.add')}
        </Button>
      )}
    </div>
  )

  let content: React.ReactNode
  if (isLoading || roleLoading) {
    content = (
      <div role="status" aria-busy="true" aria-label={t('common.loading')} className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  } else if (loadError === 'forbidden') {
    content = (
      <WebhooksNotice
        icon={<Lock className="h-5 w-5" />}
        title={t('webhooks.forbidden-title')}
        text={t('webhooks.forbidden-text')}
      />
    )
  } else if (loadError) {
    content = (
      <WebhooksNotice icon={<WebhookIcon className="h-5 w-5" />} title={t('webhooks.load-error')}>
        <Button variant="outline" onClick={load}>
          {t('webhooks.retry')}
        </Button>
      </WebhooksNotice>
    )
  } else if (webhooks.length === 0) {
    content = (
      <WebhooksNotice
        icon={<WebhookIcon className="h-5 w-5" />}
        title={t('webhooks.empty-title')}
        text={t('webhooks.empty-text')}
      >
        {canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('webhooks.add')}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t('webhooks.read-only')}</p>
        )}
      </WebhooksNotice>
    )
  } else {
    content = (
      <div className="space-y-2">
        {!canManage && (
          <p className="text-xs text-muted-foreground">
            {t('webhooks.read-only')} {t('webhooks.path-hidden')}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t('webhooks.col-url')}</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">{t('webhooks.col-environments')}</th>
                <th className="px-4 py-2 font-medium">{t('webhooks.col-status')}</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">{t('webhooks.col-last-delivery')}</th>
                {canManage && (
                  <th className="w-12 px-2 py-2">
                    <span className="sr-only">{t('webhooks.col-actions')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {webhooks.map((webhook) => (
                <tr key={webhook.id} className="align-top">
                  <td className="max-w-[16rem] px-4 py-3 sm:max-w-xs">
                    <Link
                      to={webhookPath(projectId, webhook.id)}
                      className="block truncate font-mono text-xs text-foreground hover:underline"
                      title={webhook.url}
                    >
                      {webhook.url}
                    </Link>
                    {webhook.description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{webhook.description}</p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <WebhookEnvironments webhook={webhook} environments={environments} />
                  </td>
                  <td className="px-4 py-3">
                    <WebhookStatus webhook={webhook} />
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground md:table-cell">
                    {webhook.lastDeliveryAt ? new Date(webhook.lastDeliveryAt).toLocaleString(i18n.language) : '–'}
                  </td>
                  {canManage && (
                    <td className="px-2 py-2 text-right">
                      <WebhookActions
                        projectId={projectId}
                        webhook={webhook}
                        environments={environments}
                        onUpdated={replace}
                        onDeleted={(deleted) => setWebhooks((list) => list.filter((w) => w.id !== deleted.id))}
                        onDelivery={refresh}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {header}
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
