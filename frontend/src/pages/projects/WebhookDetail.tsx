import { ArrowLeft, Lock, RefreshCw, Send, Webhook as WebhookIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DeliveriesTable } from '@/components/webhooks/DeliveriesTable'
import { useCanManageWebhooks } from '@/components/webhooks/useCanManageWebhooks'
import { WebhookActions } from '@/components/webhooks/WebhookActions'
import { WebhookEnvironments, WebhookStatus } from '@/components/webhooks/WebhookStatus'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorStatus } from '@/lib/errors'
import { projectPath } from '@/lib/routes'
import { notifyDeliveryResult } from '@/components/webhooks/notifyDeliveryResult'
import {
  type ProjectEnvironment,
  type Webhook,
  type WebhookDelivery,
  webhookErrorMessage,
  writeErrorMessage,
  webhooksApi,
} from '@/lib/webhooks'
import { WebhooksNotice } from './Webhooks'

type LoadError = 'forbidden' | 'not-found' | 'failed' | null

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export default function WebhookDetail() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { projectId = '', webhookId = '' } = useParams<{ projectId: string; webhookId: string }>()
  const { canManage, roleLoading } = useCanManageWebhooks(projectId)
  const [webhook, setWebhook] = useState<Webhook | null>(null)
  const [environments, setEnvironments] = useState<ProjectEnvironment[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<LoadError>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [testing, setTesting] = useState(false)
  const listPath = projectPath(projectId, 'webhooks')

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [list, envs] = await Promise.all([
        webhooksApi.list(projectId),
        webhooksApi.environments(projectId).catch(() => [] as ProjectEnvironment[]),
      ])
      const found = list.find((w) => w.id === webhookId) ?? null
      setWebhook(found)
      setEnvironments(envs)
      if (!found) {
        setLoadError('not-found')
        return
      }
      setDeliveries(await webhooksApi.deliveries(projectId, webhookId))
    } catch (err: unknown) {
      const status = getErrorStatus(err)
      setLoadError(status === 403 ? 'forbidden' : status === 404 ? 'not-found' : 'failed')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, webhookId])

  useEffect(() => {
    if (projectId && webhookId) load()
  }, [projectId, webhookId, load])

  /** Reloads deliveries and webhook stats without the skeleton. */
  const refresh = async () => {
    setRefreshing(true)
    try {
      const [list, items] = await Promise.all([
        webhooksApi.list(projectId),
        webhooksApi.deliveries(projectId, webhookId),
      ])
      setWebhook(list.find((w) => w.id === webhookId) ?? null)
      setDeliveries(items)
    } catch (err: unknown) {
      toast.error(webhookErrorMessage(err, t))
    } finally {
      setRefreshing(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      notifyDeliveryResult(await webhooksApi.sendTest(projectId, webhookId), t, 'test')
      await refresh()
    } catch (err: unknown) {
      toast.error(writeErrorMessage(err, t))
    } finally {
      setTesting(false)
    }
  }

  const redeliver = async (delivery: WebhookDelivery) => {
    try {
      const result = await webhooksApi.redeliver(projectId, webhookId, delivery.id)
      setDeliveries((list) => list.map((d) => (d.id === result.id ? result : d)))
      notifyDeliveryResult(result, t, 'redeliver')
    } catch (err: unknown) {
      toast.error(writeErrorMessage(err, t))
    }
  }

  const back = (
    <Link
      to={listPath}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t('webhooks.back')}
    </Link>
  )

  if (isLoading || roleLoading) {
    return (
      <div role="status" aria-busy="true" aria-label={t('common.loading')} className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-96 max-w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (loadError || !webhook) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {back}
        {loadError === 'forbidden' ? (
          <WebhooksNotice
            icon={<Lock className="h-5 w-5" />}
            title={t('webhooks.forbidden-title')}
            text={t('webhooks.forbidden-text')}
          />
        ) : loadError === 'failed' ? (
          <WebhooksNotice icon={<WebhookIcon className="h-5 w-5" />} title={t('webhooks.load-error')}>
            <Button variant="outline" onClick={load}>
              {t('webhooks.retry')}
            </Button>
          </WebhooksNotice>
        ) : (
          <WebhooksNotice icon={<WebhookIcon className="h-5 w-5" />} title={t('webhooks.not-found')} />
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {back}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-mono text-lg font-semibold" title={webhook.url}>
            {webhook.url}
          </h1>
          {webhook.description && <p className="mt-1 text-sm text-muted-foreground">{webhook.description}</p>}
          {!canManage && <p className="mt-1 text-xs text-muted-foreground">{t('webhooks.path-hidden')}</p>}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={sendTest} disabled={testing}>
              <Send className="mr-2 h-4 w-4" />
              {t('webhooks.actions.test')}
            </Button>
            <WebhookActions
              projectId={projectId}
              webhook={webhook}
              environments={environments}
              onUpdated={setWebhook}
              onDeleted={() => navigate(listPath)}
              showTest={false}
            />
          </div>
        )}
      </div>

      <dl className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('webhooks.col-status')}>
          <WebhookStatus webhook={webhook} />
        </Field>
        <Field label={t('webhooks.col-environments')}>
          <WebhookEnvironments webhook={webhook} environments={environments} />
        </Field>
        <Field label={t('webhooks.secret.label')}>
          <code className="font-mono text-xs">{webhook.secret}</code>
        </Field>
        <Field label={t('webhooks.col-last-delivery')}>
          {webhook.lastDeliveryAt ? new Date(webhook.lastDeliveryAt).toLocaleString(i18n.language) : '–'}
        </Field>
      </dl>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('webhooks.deliveries.title')}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('webhooks.deliveries.description')}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
            {t('webhooks.deliveries.refresh')}
          </Button>
        </div>
        <DeliveriesTable deliveries={deliveries} canRedeliver={canManage} onRedeliver={redeliver} />
      </section>
    </div>
  )
}
