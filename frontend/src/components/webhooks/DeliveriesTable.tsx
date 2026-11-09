import { ChevronRight, Loader2, RotateCw } from 'lucide-react'
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type DeliveryStatus, deliveryErrorLabel, type WebhookDelivery } from '@/lib/webhooks'

const STATUS_CLASS: Record<DeliveryStatus, string> = {
  success: 'border-transparent bg-success/15 text-success',
  failed: 'border-transparent bg-destructive/15 text-destructive',
  pending: 'border-transparent bg-warning/15 text-foreground',
}

interface DeliveriesTableProps {
  deliveries: WebhookDelivery[]
  /** Shows "send again" (ADMIN+) */
  canRedeliver: boolean
  onRedeliver: (delivery: WebhookDelivery) => Promise<void>
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** Delivery log of a webhook; rows expand to the payload and response. */
export function DeliveriesTable({ deliveries, canRedeliver, onRedeliver }: DeliveriesTableProps) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const time = (value: string | null) => (value ? new Date(value).toLocaleString(i18n.language) : '–')

  const redeliver = async (delivery: WebhookDelivery) => {
    setBusy(delivery.id)
    try {
      await onRedeliver(delivery)
    } finally {
      setBusy(null)
    }
  }

  if (deliveries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {t('webhooks.deliveries.empty')}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-8 px-2 py-2">
              <span className="sr-only">{t('webhooks.deliveries.details')}</span>
            </th>
            <th className="px-3 py-2 font-medium">{t('webhooks.deliveries.col-time')}</th>
            <th className="px-3 py-2 font-medium">{t('webhooks.deliveries.col-type')}</th>
            <th className="px-3 py-2 font-medium">{t('webhooks.deliveries.col-status')}</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">{t('webhooks.deliveries.col-attempt')}</th>
            <th className="px-3 py-2 font-medium">{t('webhooks.deliveries.col-code')}</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">{t('webhooks.deliveries.col-duration')}</th>
            <th className="hidden px-3 py-2 font-medium lg:table-cell">{t('webhooks.deliveries.col-error')}</th>
            <th className="hidden px-3 py-2 font-medium lg:table-cell">{t('webhooks.deliveries.col-next')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {deliveries.map((delivery) => {
            const open = expanded === delivery.id
            const errorLabel = deliveryErrorLabel(delivery.error, t)
            return (
              <Fragment key={delivery.id}>
                <tr className={cn('align-top', open && 'bg-muted/30')}>
                  <td className="px-2 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground"
                      aria-expanded={open}
                      aria-label={t('webhooks.deliveries.toggle', { time: time(delivery.createdAt) })}
                      onClick={() => setExpanded(open ? null : delivery.id)}
                    >
                      <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
                    </Button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{time(delivery.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="font-mono text-xs">{delivery.type}</span>
                    {delivery.manual && (
                      <Badge
                        variant="outline"
                        className="ml-2 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                        title={t('webhooks.deliveries.manual-hint')}
                      >
                        <span>{t('webhooks.deliveries.manual')}</span>
                        <span className="sr-only">: {t('webhooks.deliveries.manual-hint')}</span>
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={STATUS_CLASS[delivery.status] ?? ''}>
                      {t(`webhooks.delivery-status.${delivery.status}`)}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-2.5 tabular-nums md:table-cell">{delivery.attempt}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{delivery.responseCode ?? '–'}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 tabular-nums md:table-cell">
                    {delivery.durationMs != null ? `${delivery.durationMs} ms` : '–'}
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground lg:table-cell">{errorLabel ?? '–'}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground lg:table-cell">
                    {delivery.status === 'pending' ? time(delivery.nextAttemptAt) : '–'}
                  </td>
                </tr>
                {open && (
                  <tr className="bg-muted/30">
                    <td />
                    <td colSpan={8} className="space-y-3 px-3 pb-4 pt-1">
                      {errorLabel && (
                        <p className="text-sm lg:hidden">
                          <span className="text-muted-foreground">{t('webhooks.deliveries.col-error')}: </span>
                          {errorLabel}
                        </p>
                      )}
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {t('webhooks.deliveries.payload')}
                          </p>
                          <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-xs">
                            {formatJson(delivery.event)}
                          </pre>
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {t('webhooks.deliveries.response')}
                          </p>
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-background p-3 font-mono text-xs">
                            {delivery.responseBody || t('webhooks.deliveries.no-response')}
                          </pre>
                        </div>
                      </div>
                      {canRedeliver && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => redeliver(delivery)}
                          disabled={busy !== null}
                        >
                          {busy === delivery.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCw className="mr-2 h-4 w-4" />
                          )}
                          {t('webhooks.deliveries.redeliver')}
                        </Button>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
