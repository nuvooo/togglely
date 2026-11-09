import { Loader2, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { apiMessage, type ProjectDetails } from './project'
import { SettingsSection } from './SettingsSection'

interface OriginsSectionProps {
  project: ProjectDetails
  canManage: boolean
  onSaved: (project: ProjectDetails) => void
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i])

/** Browser origins allowed to call the SDK endpoints (CORS); empty = all. */
export function OriginsSection({
  project,
  canManage,
  onSaved,
}: OriginsSectionProps) {
  const { t } = useTranslation()
  const [origins, setOrigins] = useState<string[]>(project.allowedOrigins ?? [])
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset to the saved list only when it changes (not on every save of another section).
  const savedKey = JSON.stringify(project.allowedOrigins ?? [])
  useEffect(() => {
    setOrigins(JSON.parse(savedKey))
  }, [savedKey])

  const dirty = !sameList(origins, project.allowedOrigins ?? [])

  const add = () => {
    const value = draft.trim()
    if (!value) return
    if (origins.includes(value)) {
      toast.error(t('project-settings.origins.duplicate', { origin: value }))
      return
    }
    setOrigins([...origins, value])
    setDraft('')
  }

  const save = async () => {
    setSaving(true)
    try {
      const response = await api.patch(`/projects/${project.id}`, {
        allowedOrigins: origins,
      })
      onSaved({ ...project, ...response.data.project })
      toast.success(t('project-settings.origins.saved'))
    } catch (error) {
      toast.error(apiMessage(error, t('project-settings.origins.save-failed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title={t('project-settings.origins.title')}
      description={
        <>
          {t('project-settings.origins.description')}{' '}
          <span className="mt-2 block text-xs">
            <code className="font-mono">https://example.com</code> ·{' '}
            <code className="font-mono">*.example.com</code> ·{' '}
            <code className="font-mono">*</code>
          </span>
        </>
      }
    >
      <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        {canManage && (
          <div className="space-y-2">
            <Label htmlFor="project-origin">
              {t('project-settings.origins.add-label')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="project-origin"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="https://example.com"
                className="font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    add()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={add}
                disabled={!draft.trim()}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t('project-settings.origins.add')}
              </Button>
            </div>
          </div>
        )}

        {origins.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            {t('project-settings.origins.empty')}
          </p>
        ) : (
          <ul
            aria-label={t('project-settings.origins.title')}
            className="divide-y rounded-md border"
          >
            {origins.map((origin) => (
              <li
                key={origin}
                className="flex items-center justify-between gap-2 px-3 py-1.5"
              >
                <code className="min-w-0 truncate font-mono text-xs">
                  {origin}
                </code>
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={t('project-settings.origins.remove', {
                      origin,
                    })}
                    onClick={() =>
                      setOrigins(origins.filter((o) => o !== origin))
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || !dirty}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('project-settings.origins.save')}
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  )
}
