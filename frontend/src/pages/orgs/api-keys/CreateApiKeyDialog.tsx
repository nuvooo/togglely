import { Bot, Globe, Loader2, Server } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { type CREATE_KEY_TYPES, EXPIRY_OPTIONS } from './apiKeys'

export interface NewApiKey {
  name: string
  type: (typeof CREATE_KEY_TYPES)[number]
  /** Omitted = never expires. */
  expiresInDays?: number
  /** MCP only: the project the key works in. */
  projectId?: string
  /** MCP only: the environments the key may toggle flags in (may be empty). */
  allowedEnvironmentIds?: string[]
}

export interface ProjectEnvironment {
  id: string
  name: string
  key: string
}

interface CreateApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Persists the key; rejecting keeps the dialog open with the message. */
  onCreate: (key: NewApiKey) => Promise<void>
  /** Types the user may create (members: only MCP). */
  types: readonly NewApiKey['type'][]
  /** Projects of the organization, for MCP keys. */
  projects: { id: string; name: string }[]
  /** Environments of a project, for the MCP "may toggle in" list. */
  loadEnvironments: (projectId: string) => Promise<ProjectEnvironment[]>
}

const TYPE_ICON = { CLIENT: Globe, SERVER: Server, MCP: Bot } as const

/** Name, type (explained), expiry and, for MCP, project and environments of a new API key. */
export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreate,
  types,
  projects,
  loadEnvironments,
}: CreateApiKeyDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [type, setType] = useState<NewApiKey['type']>(types[0] ?? 'CLIENT')
  const [expiry, setExpiry] = useState<string>('365')
  const [projectId, setProjectId] = useState('')
  const [envs, setEnvs] = useState<ProjectEnvironment[] | null>(null)
  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([])
  const [envsError, setEnvsError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setType(types[0] ?? 'CLIENT')
    setExpiry('365')
    setProjectId('')
    setError(null)
  }, [open, types])

  useEffect(() => {
    setEnvs(null)
    setSelectedEnvs([])
    setEnvsError(false)
    if (!projectId) return
    let current = true
    loadEnvironments(projectId)
      .then((list) => {
        if (!current) return
        setEnvs(list)
        const dev = list.find((env) => env.key === 'development')
        setSelectedEnvs(dev ? [dev.id] : [])
      })
      .catch(() => {
        if (current) setEnvsError(true)
      })
    return () => {
      current = false
    }
  }, [projectId, loadEnvironments])

  const isMcp = type === 'MCP'
  // MCP: the environments must be loaded; selecting none is allowed and
  // yields a key that can read, create and delete flags but not toggle them.
  const canSubmit =
    !busy &&
    Boolean(name.trim()) &&
    (!isMcp || (Boolean(projectId) && envs !== null))

  const toggleEnv = (id: string, checked: boolean) =>
    setSelectedEnvs((list) =>
      checked ? [...list, id] : list.filter((value) => value !== id)
    )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onCreate({
        name: name.trim(),
        type,
        ...(isMcp ? { projectId, allowedEnvironmentIds: selectedEnvs } : {}),
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
              {types.map((value) => {
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
          {isMcp && (
            <>
              <div className="space-y-2">
                <Label htmlFor="api-key-project">
                  {t('org-pages.api-keys.project-label')}
                </Label>
                <select
                  id="api-key-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  required
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">
                    {t('org-pages.api-keys.project-placeholder')}
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              {projectId && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    {t('org-pages.api-keys.toggle-envs-label')}
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    {t('org-pages.api-keys.toggle-envs-hint')}
                  </p>
                  {envsError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {t('org-pages.api-keys.envs-load-failed')}
                    </p>
                  ) : envs === null ? (
                    <p className="text-sm text-muted-foreground">
                      {t('org-pages.api-keys.envs-loading')}
                    </p>
                  ) : (
                    envs.map((env) => (
                      <div key={env.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`api-key-env-${env.id}`}
                          checked={selectedEnvs.includes(env.id)}
                          onCheckedChange={(checked) =>
                            toggleEnv(env.id, checked === true)
                          }
                        />
                        <Label
                          htmlFor={`api-key-env-${env.id}`}
                          className="font-normal"
                        >
                          {env.name}
                        </Label>
                      </div>
                    ))
                  )}
                  {envs !== null && selectedEnvs.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('org-pages.api-keys.no-envs-hint')}
                    </p>
                  )}
                </fieldset>
              )}
            </>
          )}
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
            <Button type="submit" disabled={!canSubmit}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
