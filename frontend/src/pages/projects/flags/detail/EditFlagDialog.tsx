import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { getErrorMessage } from '@/lib/errors'

interface EditFlagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  description: string | null
  /** Persists the change; rejects → error shown, dialog stays open. */
  onSave: (values: { name: string; description: string }) => Promise<void>
}

/** Edits name and description of a flag (the key is immutable). */
export function EditFlagDialog({
  open,
  onOpenChange,
  name,
  description,
  onSave,
}: EditFlagDialogProps) {
  const { t } = useTranslation()
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraftName(name)
      setDraftDescription(description ?? '')
      setError(null)
    }
  }, [open, name, description])

  const save = async () => {
    const trimmed = draftName.trim()
    if (!trimmed) {
      setError(t('flag-detail.edit.name-required'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: trimmed, description: draftDescription.trim() })
      onOpenChange(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('flag-detail.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('flag-detail.edit.description')}
          </DialogDescription>
        </DialogHeader>
        <form
          id="edit-flag-form"
          className="space-y-4 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-flag-name">{t('flag-detail.edit.name')}</Label>
            <Input
              id="edit-flag-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={200}
              aria-invalid={!!error}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-flag-description">
              {t('flag-detail.edit.flag-description')}
            </Label>
            <textarea
              id="edit-flag-description"
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              rows={3}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="edit-flag-form" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
