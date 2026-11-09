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
import { sanitizeKey, toKey } from '@/pages/projects/settings/project'

export interface NewProject {
  name: string
  key: string
  type: 'SINGLE' | 'MULTI'
}

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgName: string
  /** Persists the project; rejecting keeps the dialog open with the message. */
  onCreate: (project: NewProject) => Promise<void>
}

/** Name, key (derived from the name until edited) and type of a new project. */
export function CreateProjectDialog({
  open,
  onOpenChange,
  orgName,
  onCreate,
}: CreateProjectDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [type, setType] = useState<NewProject['type']>('SINGLE')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setKey('')
    setType('SINGLE')
    setError(null)
  }, [open])

  const changeName = (value: string) => {
    setName(value)
    if (!key || key === toKey(name)) setKey(toKey(value))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !key) return
    setBusy(true)
    setError(null)
    try {
      await onCreate({ name: name.trim(), key, type })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('org-pages.projects.create-title')}</DialogTitle>
          <DialogDescription>
            {t('org-pages.projects.create-description', { org: orgName })}
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
            <Label htmlFor="project-name">
              {t('org-pages.projects.name-label')}
            </Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => changeName(e.target.value)}
              placeholder={t('org-pages.projects.name-placeholder')}
              maxLength={200}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-key">
              {t('org-pages.projects.key-label')}
            </Label>
            <Input
              id="project-key"
              value={key}
              onChange={(e) => setKey(sanitizeKey(e.target.value))}
              placeholder="my-project"
              maxLength={100}
              required
              className="font-mono"
              aria-describedby="project-key-hint"
            />
            <p id="project-key-hint" className="text-xs text-muted-foreground">
              {t('org-pages.projects.key-hint')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-type">
              {t('org-pages.projects.type-label')}
            </Label>
            <select
              id="project-type"
              value={type}
              onChange={(e) => setType(e.target.value as NewProject['type'])}
              aria-describedby="project-type-hint"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="SINGLE">
                {t('org-pages.projects.type-single')}
              </option>
              <option value="MULTI">
                {t('org-pages.projects.type-multi')}
              </option>
            </select>
            <p id="project-type-hint" className="text-xs text-muted-foreground">
              {type === 'MULTI'
                ? t('org-pages.projects.type-multi-hint')
                : t('org-pages.projects.type-single-hint')}
            </p>
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
            <Button type="submit" disabled={busy || !name.trim() || !key}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
