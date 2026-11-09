import { KeyRound, MoreHorizontal, Pencil, Power, Send, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/members/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  type ProjectEnvironment,
  type Webhook,
  type WebhookDelivery,
  writeErrorMessage,
  webhooksApi,
} from '@/lib/webhooks'
import { notifyDeliveryResult } from './notifyDeliveryResult'
import { WebhookFormDialog } from './WebhookFormDialog'
import { WebhookSecretDialog } from './WebhookSecretDialog'

interface WebhookActionsProps {
  projectId: string
  webhook: Webhook
  environments: ProjectEnvironment[]
  onUpdated: (webhook: Webhook) => void
  onDeleted: (webhook: Webhook) => void
  /** Called with the result of "send test" */
  onDelivery?: (delivery: WebhookDelivery) => void
  /** Offer "send test" in the menu (off where the page has its own button) */
  showTest?: boolean
}

type Confirmation = 'delete' | 'rotate' | null

/** Row/header actions of a webhook (ADMIN+): test, edit, rotate, toggle, delete. */
export function WebhookActions({
  projectId,
  webhook,
  environments,
  onUpdated,
  onDeleted,
  onDelivery,
  showTest = true,
}: WebhookActionsProps) {
  const { t } = useTranslation()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [secret, setSecret] = useState<string | null>(null)
  /** New secret from a rotation; shown once the confirmation dialog has closed */
  const rotatedSecret = useRef<string | null>(null)

  const sendTest = async () => {
    const pending = toast.loading(t('webhooks.test.sending'))
    try {
      const delivery = await webhooksApi.sendTest(projectId, webhook.id)
      toast.dismiss(pending)
      notifyDeliveryResult(delivery, t, 'test')
      onDelivery?.(delivery)
    } catch (err: unknown) {
      toast.dismiss(pending)
      toast.error(writeErrorMessage(err, t))
    }
  }

  const toggle = async () => {
    try {
      const updated = await webhooksApi.update(projectId, webhook.id, { enabled: !webhook.enabled })
      onUpdated(updated)
      toast.success(updated.enabled ? t('webhooks.toast.enabled') : t('webhooks.toast.disabled'))
    } catch (err: unknown) {
      toast.error(writeErrorMessage(err, t))
    }
  }

  const confirm = async () => {
    try {
      if (confirmation === 'delete') {
        await webhooksApi.remove(projectId, webhook.id)
        toast.success(t('webhooks.toast.deleted'))
        onDeleted(webhook)
      } else if (confirmation === 'rotate') {
        const result = await webhooksApi.rotateSecret(projectId, webhook.id)
        onUpdated(result.webhook)
        rotatedSecret.current = result.secret
      }
    } catch (err: unknown) {
      toast.error(writeErrorMessage(err, t))
    }
  }

  const confirmText =
    confirmation === 'rotate'
      ? {
          title: t('webhooks.rotate.title'),
          description: t('webhooks.rotate.description'),
          confirmLabel: t('webhooks.actions.rotate'),
        }
      : {
          title: t('webhooks.delete.title'),
          description: t('webhooks.delete.description', { url: webhook.url }),
          confirmLabel: t('common.delete'),
        }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label={t('webhooks.actions.label', { url: webhook.url })}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showTest && (
            <DropdownMenuItem onSelect={sendTest}>
              <Send className="mr-2 h-4 w-4" />
              {t('webhooks.actions.test')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmation('rotate')}>
            <KeyRound className="mr-2 h-4 w-4" />
            {t('webhooks.actions.rotate')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggle}>
            <Power className="mr-2 h-4 w-4" />
            {webhook.enabled ? t('webhooks.actions.disable') : t('webhooks.actions.enable')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setConfirmation('delete')}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WebhookFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={projectId}
        environments={environments}
        webhook={webhook}
        onSaved={(updated) => {
          onUpdated(updated)
          toast.success(t('webhooks.toast.saved'))
        }}
      />

      <ConfirmDialog
        open={confirmation !== null}
        {...confirmText}
        onConfirm={confirm}
        onOpenChange={(open) => {
          if (open) return
          setConfirmation(null)
          if (rotatedSecret.current) {
            setSecret(rotatedSecret.current)
            rotatedSecret.current = null
          }
        }}
      />

      <WebhookSecretDialog secret={secret} reason="rotated" onClose={() => setSecret(null)} />
    </>
  )
}
