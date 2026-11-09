import { Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
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
import { sanitizeKey, toKey } from '../settings/project'
import type { Environment } from './environments'

interface EnvironmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Environment to rename; `null` creates a new one. */
  environment: Environment | null
  /** Rejects to keep the dialog open (the caller shows the error). */
  onSubmit: (values: { name: string; key: string }) => Promise<void>
}

/** Create (name + key) or rename (name only; the key is fixed) an environment. */
export function EnvironmentDialog({
  open,
  onOpenChange,
  environment,
  onSubmit,
}: EnvironmentDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const editing = environment !== null

  useEffect(() => {
    if (!open) return
    setName(environment?.name ?? '')
    setKey(environment?.key ?? '')
  }, [open, environment])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await onSubmit({ name: name.trim(), key })
      onOpenChange(false)
    } catch {
      // The caller reported the error; keep the input.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t('environments-page.dialog.rename-title')
              : t('environments-page.dialog.create-title')}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? t('environments-page.dialog.rename-text')
              : t('environments-page.dialog.create-text')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="environment-name">
              {t('environments-page.dialog.name')}
            </Label>
            <Input
              id="environment-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!editing) setKey(toKey(e.target.value))
              }}
              placeholder="Staging"
              required
              autoFocus
            />
          </div>
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="environment-key">
                {t('environments-page.dialog.key')}
              </Label>
              <Input
                id="environment-key"
                value={key}
                onChange={(e) => setKey(sanitizeKey(e.target.value))}
                placeholder="staging"
                required
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t('environments-page.dialog.key-hint')}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={busy || !name.trim() || (!editing && !key)}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t('common.save') : t('environments-page.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
