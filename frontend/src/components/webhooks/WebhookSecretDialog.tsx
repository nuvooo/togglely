import { ChevronRight, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CopyLinkField } from '@/components/members/CopyLinkField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SIGNATURE_SNIPPET } from '@/lib/webhooks'
import { CodeBlock } from './CodeBlock'

interface WebhookSecretDialogProps {
  /** Plain secret; the dialog is open while it is set */
  secret: string | null
  reason: 'created' | 'rotated'
  onClose: () => void
}

/** Shows a webhook signing secret exactly once, with a verification example. */
export function WebhookSecretDialog({ secret, reason, onClose }: WebhookSecretDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={secret !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {reason === 'created' ? t('webhooks.secret.created-title') : t('webhooks.secret.rotated-title')}
          </DialogTitle>
          <DialogDescription>{t('webhooks.secret.description')}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {secret && <CopyLinkField id="webhook-secret" label={t('webhooks.secret.label')} value={secret} />}

          <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{t('webhooks.secret.once-warning')}</span>
          </p>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{t('webhooks.secret.headers-intro')}</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>
                <code className="font-mono text-xs text-foreground">X-Togglely-Signature: t=…,v1=…</code>
              </li>
              <li>
                <code className="font-mono text-xs text-foreground">X-Togglely-Event</code>,{' '}
                <code className="font-mono text-xs text-foreground">X-Togglely-Delivery</code>
              </li>
            </ul>
          </div>

          <details className="group rounded-md border">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              {t('webhooks.secret.snippet-title')}
            </summary>
            <div className="space-y-2 border-t p-3">
              <p className="text-xs text-muted-foreground">{t('webhooks.secret.snippet-hint')}</p>
              <CodeBlock code={SIGNATURE_SNIPPET} label={t('webhooks.secret.snippet-title')} className="max-h-72 overflow-y-auto" />
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t('webhooks.secret.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
