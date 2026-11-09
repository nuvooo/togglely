import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { FAILURE_WARNING_THRESHOLD, type ProjectEnvironment, type Webhook } from '@/lib/webhooks'

/** Enabled/disabled badge plus the result of the last delivery. */
export function WebhookStatus({ webhook }: { webhook: Webhook }) {
  const { t, i18n } = useTranslation()
  const last = webhook.lastDeliveryAt ? new Date(webhook.lastDeliveryAt).toLocaleString(i18n.language) : null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={webhook.enabled ? 'secondary' : 'outline'}>
          {webhook.enabled ? t('webhooks.status.enabled') : t('webhooks.status.disabled')}
        </Badge>
        {webhook.lastStatus === 'success' && (
          <span className="inline-flex items-center gap-1 text-xs text-success" title={last ?? undefined}>
            <CircleCheck className="h-3.5 w-3.5" aria-hidden />
            {t('webhooks.status.last-success')}
          </span>
        )}
        {webhook.lastStatus === 'failed' && (
          <span className="inline-flex items-center gap-1 text-xs text-destructive" title={last ?? undefined}>
            <CircleX className="h-3.5 w-3.5" aria-hidden />
            {t('webhooks.status.last-failed')}
          </span>
        )}
        {!webhook.lastStatus && <span className="text-xs text-muted-foreground">{t('webhooks.status.never')}</span>}
      </div>
      {webhook.consecutiveFailures >= FAILURE_WARNING_THRESHOLD && (
        <span className="inline-flex items-center gap-1 text-xs text-warning">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('webhooks.status.failures', { count: webhook.consecutiveFailures })}
        </span>
      )}
    </div>
  )
}

/** Environment badges, or "All" for an empty filter. */
export function WebhookEnvironments({
  webhook,
  environments,
}: {
  webhook: Webhook
  environments: ProjectEnvironment[]
}) {
  const { t } = useTranslation()
  if (webhook.environmentIds.length === 0) {
    return <span className="text-sm text-muted-foreground">{t('webhooks.all')}</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {webhook.environmentIds.map((id) => (
        <Badge key={id} variant="outline" className="font-normal">
          {environments.find((e) => e.id === id)?.name ?? id}
        </Badge>
      ))}
    </div>
  )
}
