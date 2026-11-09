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

export interface Brand {
  id: string
  name: string
  key: string
  description: string | null
}

export interface BrandInput {
  name: string
  key: string
  description: string
}

interface BrandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Brand to edit; `null` creates a new one. */
  brand: Brand | null
  /** Rejects to keep the dialog open (the caller shows the error). */
  onSubmit: (values: BrandInput) => Promise<void>
}

/** Create (name, key, description) or edit (name, description; the key is fixed) a brand. */
export function BrandDialog({
  open,
  onOpenChange,
  brand,
  onSubmit,
}: BrandDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const editing = brand !== null

  useEffect(() => {
    if (!open) return
    setName(brand?.name ?? '')
    setKey(brand?.key ?? '')
    setDescription(brand?.description ?? '')
  }, [open, brand])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        name: name.trim(),
        key,
        description: description.trim(),
      })
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
              ? t('brands-page.dialog.edit-title')
              : t('brands-page.dialog.create-title')}
          </DialogTitle>
          <DialogDescription>{t('brands-page.dialog.text')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brand-name">{t('brands-page.dialog.name')}</Label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!editing) setKey(toKey(e.target.value))
              }}
              placeholder="Brand A"
              required
              autoFocus
            />
          </div>
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="brand-key">{t('brands-page.dialog.key')}</Label>
              <Input
                id="brand-key"
                value={key}
                onChange={(e) => setKey(sanitizeKey(e.target.value))}
                placeholder="brand-a"
                required
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t('brands-page.dialog.key-hint')}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="brand-description">
              {t('brands-page.dialog.description')}
            </Label>
            <Input
              id="brand-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('brands-page.dialog.description-placeholder')}
            />
          </div>
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
              {editing ? t('common.save') : t('brands-page.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
