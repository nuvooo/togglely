import { ShieldAlert } from 'lucide-react'
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
import type { ApiKeyType } from './apiKeys'

interface ApiKeyCreatedDialogProps {
  /** The new key in plain text; the dialog is open while it is set. */
  created: { name: string; type: ApiKeyType; key: string } | null
  onClose: () => void
}

/**
 * Shows a new API key in plain text. Admins can copy it later from the list
 * (others only see it masked), so the dialog says that instead of "only
 * once". Escape, outside clicks and the X cannot close it; "Done" is enabled
 * after the user confirmed saving the key.
 */
export function ApiKeyCreatedDialog({
  created,
  onClose,
}: ApiKeyCreatedDialogProps) {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (created) setSaved(false)
  }, [created])

  return (
    <Dialog open={created !== null}>
      <DialogContent
        className="sm:max-w-lg"
        hideCloseButton
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('org-pages.api-keys.created-title')}</DialogTitle>
          <DialogDescription>
            {created
              ? t('org-pages.api-keys.created-description', {
                  name: created.name,
                  type: t(`org-pages.api-keys.type.${created.type}`),
                })
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {created && (
            <CopyLinkField
              id="new-api-key"
              label={t('org-pages.api-keys.created-label')}
              value={created.key}
            />
          )}
          <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              aria-hidden
            />
            <span>
              {created?.type === 'CLIENT'
                ? t('org-pages.api-keys.created-warning-client')
                : t('org-pages.api-keys.created-warning-server')}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {t('org-pages.api-keys.created-visibility')}
          </p>
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="api-key-saved"
              checked={saved}
              onCheckedChange={(checked) => setSaved(checked === true)}
            />
            <Label htmlFor="api-key-saved" className="font-normal">
              {t('org-pages.api-keys.created-saved')}
            </Label>
          </div>
          <Button onClick={onClose} disabled={!saved}>
            {t('org-pages.api-keys.created-done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
