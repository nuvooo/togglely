import { Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { FLAG_TYPES, type FlagType } from './types'
import type { NewFlag } from './useProjectFlags'

/** "My Feature" -> "my-feature" */
export const toFlagKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

interface CreateFlagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  /** Persists the flag; rejects → toast, dialog stays open. */
  onCreate: (flag: NewFlag) => Promise<void>
}

/** Name (key derived until edited by hand) and type of a new flag. */
export function CreateFlagDialog({
  open,
  onOpenChange,
  projectName,
  onCreate,
}: CreateFlagDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [type, setType] = useState<FlagType>('BOOLEAN')
  const [busy, setBusy] = useState(false)

  // A fresh form on every open
  useEffect(() => {
    if (!open) return
    setName('')
    setKey('')
    setType('BOOLEAN')
  }, [open])

  const changeName = (value: string) => {
    setName(value)
    if (!key || key === toFlagKey(name)) setKey(toFlagKey(value))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name || !key) return
    setBusy(true)
    try {
      await onCreate({ name, key, type })
      toast.success(t('flags-page.created', { name }))
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('project-detail.create-flag.title')}</DialogTitle>
          <DialogDescription>
            {t('project-detail.create-flag.description', {
              name: projectName,
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="flagName">
              {t('project-detail.create-flag.name-label')}
            </Label>
            <Input
              id="flagName"
              placeholder={t('project-detail.create-flag.name-placeholder')}
              value={name}
              onChange={(e) => changeName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flagKey">
              {t('project-detail.create-flag.key-label')}
            </Label>
            <Input
              id="flagKey"
              placeholder={t('project-detail.create-flag.key-placeholder')}
              value={key}
              onChange={(e) =>
                setKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }
              required
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t('flags-page.create.key-hint')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="flagType">
              {t('project-detail.create-flag.type-label')}
            </Label>
            <select
              id="flagType"
              value={type}
              onChange={(e) => setType(e.target.value as FlagType)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {FLAG_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`flags-page.create.type-${value.toLowerCase()}`)}
                </option>
              ))}
            </select>
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
            <Button type="submit" disabled={busy || !name || !key}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
