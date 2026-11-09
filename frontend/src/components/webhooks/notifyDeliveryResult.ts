import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { deliveryErrorLabel, type WebhookDelivery } from '@/lib/webhooks'

/**
 * Toast for the outcome of a manual send. Test events are one-shot (no
 * retries); a redelivered event keeps its retry plan when it fails.
 */
export function notifyDeliveryResult(delivery: WebhookDelivery, t: TFunction, kind: 'test' | 'redeliver') {
  const code = delivery.responseCode ?? '–'
  if (delivery.status === 'success') {
    toast.success(kind === 'test' ? t('webhooks.test.success', { code }) : t('webhooks.redeliver.success', { code }))
    return
  }
  const reason =
    deliveryErrorLabel(delivery.error, t) ??
    (delivery.responseCode ? `HTTP ${delivery.responseCode}` : t('webhooks.test.unknown'))
  if (kind === 'test') toast.error(t('webhooks.test.failed', { reason }))
  else if (delivery.status === 'pending') toast.error(t('webhooks.redeliver.failed-retry', { reason }))
  else toast.error(t('webhooks.redeliver.failed', { reason }))
}
