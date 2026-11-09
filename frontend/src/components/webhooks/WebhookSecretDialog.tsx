import { ChevronRight, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyLinkField } from '@/components/members/CopyLinkField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SIGNATURE_SNIPPET } from '@/lib/webhooks'
import { CodeBlock } from './CodeBlock'

interface WebhookSecretDialogProps {
  /** Plain secret; the dialog is open while it is set */
  secret: string | null
  reason: 'created' | 'rotated'
  onClose: () => void
}

/**
 * Shows a webhook signing secret exactly once, with a verification example.
 * Escape, outside clicks and the X button cannot close it: the secret would be
 * lost. Only "Done" closes it, after the user confirmed saving the secret.
 */
export function WebhookSecretDialog({ secret, reason, onClose }: WebhookSecretDialogProps) {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (secret) setSaved(false)
  }, [secret])

  return (
    <Dialog open={secret !== null}>
      <DialogContent
        className="sm:max-w-2xl"
        hideCloseButton
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {reason === 'created' ? t('webhooks.secret.created-title') : t('webhooks.secret.rotated-title')}
          </DialogTitle>
          <DialogDescription>{t('webhooks.secret.description')}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {secret && <CopyLinkField id="webhook-secret" label={t('webhooks.secret.label')} value={secret} />}

          <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
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
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
              {t('webhooks.secret.snippet-title')}
            </summary>
            <div className="space-y-2 border-t p-3">
              <p className="text-xs text-muted-foreground">{t('webhooks.secret.snippet-hint')}</p>
              <CodeBlock
                code={SIGNATURE_SNIPPET}
                label={t('webhooks.secret.snippet-title')}
                className="max-h-72 overflow-y-auto"
              />
            </div>
          </details>
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="webhook-secret-saved"
              checked={saved}
              onCheckedChange={(checked) => setSaved(checked === true)}
            />
            <Label htmlFor="webhook-secret-saved" className="font-normal">
              {t('webhooks.secret.saved')}
            </Label>
          </div>
          <Button onClick={onClose} disabled={!saved}>
            {t('webhooks.secret.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
