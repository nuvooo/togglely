import { Globe, Loader2, Server } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { CREATE_KEY_TYPES, EXPIRY_OPTIONS } from './apiKeys'

export interface NewApiKey {
  name: string
  type: (typeof CREATE_KEY_TYPES)[number]
  /** Omitted = never expires. */
  expiresInDays?: number
}

interface CreateApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Persists the key; rejecting keeps the dialog open with the message. */
  onCreate: (key: NewApiKey) => Promise<void>
}

const TYPE_ICON = { CLIENT: Globe, SERVER: Server } as const

/** Name, type (CLIENT/SERVER, explained) and expiry of a new API key. */
export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateApiKeyDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [type, setType] = useState<NewApiKey['type']>('CLIENT')
  const [expiry, setExpiry] = useState<string>('365')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setType('CLIENT')
    setExpiry('365')
    setError(null)
  }, [open])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onCreate({
        name: name.trim(),
        type,
        ...(expiry ? { expiresInDays: Number(expiry) } : {}),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('org-pages.api-keys.create-title')}</DialogTitle>
          <DialogDescription>
            {t('org-pages.api-keys.create-description')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="api-key-name">
              {t('org-pages.api-keys.name-label')}
            </Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('org-pages.api-keys.name-placeholder')}
              maxLength={100}
              required
              autoFocus
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t('org-pages.api-keys.type-label')}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CREATE_KEY_TYPES.map((value) => {
                const Icon = TYPE_ICON[value]
                const id = `api-key-type-${value.toLowerCase()}`
                return (
                  <label
                    key={value}
                    htmlFor={id}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      type === value
                        ? 'border-foreground/40 bg-accent'
                        : 'hover:bg-accent/50'
                    )}
                  >
                    <input
                      id={id}
                      type="radio"
                      name="api-key-type"
                      value={value}
                      checked={type === value}
                      onChange={() => setType(value)}
                      className="sr-only"
                      aria-describedby={`${id}-hint`}
                    />
                    <Icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="space-y-0.5">
                      <span className="block font-medium">
                        {t(`org-pages.api-keys.type.${value}`)}
                      </span>
                      <span
                        id={`${id}-hint`}
                        className="block text-xs text-muted-foreground"
                      >
                        {t(`org-pages.api-keys.type-hint.${value}`)}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="api-key-expiry">
              {t('org-pages.api-keys.expiry-label')}
            </Label>
            <select
              id="api-key-expiry"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {EXPIRY_OPTIONS.map((days) => (
                <option key={days || 'never'} value={days}>
                  {days
                    ? t('org-pages.api-keys.expiry-days', {
                        count: Number(days),
                      })
                    : t('org-pages.api-keys.expiry-never')}
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
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
