import { Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type ProjectEnvironment, type Webhook, webhookErrorMessage, webhooksApi } from '@/lib/webhooks'
import { EnvironmentSelect } from './EnvironmentSelect'

interface WebhookFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  environments: ProjectEnvironment[]
  /** Edit this webhook; create a new one when omitted */
  webhook?: Webhook | null
  /** `secret` is only set for a newly created webhook */
  onSaved: (webhook: Webhook, secret?: string) => void
}

export function WebhookFormDialog({
  open,
  onOpenChange,
  projectId,
  environments,
  webhook,
  onSaved,
}: WebhookFormDialogProps) {
  const { t } = useTranslation()
  const editing = Boolean(webhook)
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [environmentIds, setEnvironmentIds] = useState<string[]>([])
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setUrl(webhook?.url ?? '')
    setDescription(webhook?.description ?? '')
    setEnvironmentIds(webhook?.environmentIds ?? [])
    setEnabled(webhook?.enabled ?? true)
    setError(null)
  }, [open, webhook])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const input = { url: url.trim(), description: description.trim(), environmentIds, enabled }
    try {
      if (webhook) {
        onSaved(await webhooksApi.update(projectId, webhook.id, input))
      } else {
        const { webhook: created, secret } = await webhooksApi.create(projectId, {
          ...input,
          description: input.description || undefined,
        })
        onSaved(created, secret)
      }
      onOpenChange(false)
    } catch (err: unknown) {
      setError(webhookErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{editing ? t('webhooks.form.edit-title') : t('webhooks.form.create-title')}</DialogTitle>
            <DialogDescription>{t('webhooks.form.description')}</DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t('webhooks.form.url')}</Label>
            <Input
              id="webhook-url"
              type="url"
              required
              maxLength={2048}
              placeholder="https://example.com/hooks/togglely"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-sm"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{t('webhooks.form.url-hint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-description">
              {t('webhooks.form.label')}{' '}
              <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Input
              id="webhook-description"
              maxLength={200}
              placeholder={t('webhooks.form.label-placeholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <EnvironmentSelect
            environments={environments}
            value={environmentIds}
            onChange={setEnvironmentIds}
            disabled={busy}
          />

          <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <div>
              <Label htmlFor="webhook-enabled">{t('webhooks.form.enabled')}</Label>
              <p className="text-xs text-muted-foreground">{t('webhooks.form.enabled-hint')}</p>
            </div>
            <Switch id="webhook-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={busy} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t('common.save') : t('webhooks.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
