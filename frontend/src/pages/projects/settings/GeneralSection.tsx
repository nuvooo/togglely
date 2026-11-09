import { Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/lib/axios'
import { notifyWriteError } from '@/lib/permissions'
import { refreshWorkspace } from '@/lib/workspace'
import { apiMessage, type ProjectDetails, type ProjectType } from './project'
import { SettingsSection } from './SettingsSection'

/** Brands of a MULTI project, or the state of loading them. */
export type BrandCount = number | 'loading' | 'failed'

interface GeneralSectionProps {
  project: ProjectDetails
  canManage: boolean
  /**
   * Brands of a MULTI project. Converting to SINGLE keeps them but SINGLE
   * projects ignore them, so it asks first (also when the count is unknown).
   */
  brandCount: BrandCount
  onSaved: (project: ProjectDetails) => void
}

/** Name, key (read-only), description and type of the project. */
export function GeneralSection({
  project,
  canManage,
  brandCount,
  onSaved,
}: GeneralSectionProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [type, setType] = useState<ProjectType>(project.type)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Reset to the saved values only when they change (not on every save of another section).
  useEffect(() => {
    setName(project.name)
    setDescription(project.description ?? '')
    setType(project.type)
  }, [project.name, project.description, project.type])

  const dirty =
    name !== project.name ||
    description !== (project.description ?? '') ||
    type !== project.type
  const toSingle = project.type === 'MULTI' && type === 'SINGLE'
  // Without the brand count the warning could be skipped wrongly: wait for it.
  const waitingForBrands = toSingle && brandCount === 'loading'

  const save = async () => {
    setSaving(true)
    try {
      const response = await api.patch(`/projects/${project.id}`, {
        name: name.trim(),
        description,
        type,
      })
      onSaved({ ...project, ...response.data.project })
      // Keep the workspace switcher and the navigation (brands) in sync.
      refreshWorkspace().catch(() => {})
      toast.success(t('project-settings.general.saved'))
    } catch (error) {
      notifyWriteError(
        error,
        t,
        apiMessage(error, t('project-settings.general.save-failed'))
      )
    } finally {
      setSaving(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (waitingForBrands) return
    if (
      toSingle &&
      (brandCount === 'failed' || (typeof brandCount === 'number' && brandCount > 0))
    ) {
      setConfirmOpen(true)
      return
    }
    save()
  }

  return (
    <SettingsSection
      title={t('project-settings.general.title')}
      description={t('project-settings.general.description')}
    >
      <form
        onSubmit={submit}
        className="space-y-4 rounded-lg border bg-card p-4 sm:p-6"
      >
        <div className="space-y-2">
          <Label htmlFor="project-name">
            {t('project-settings.general.name')}
          </Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={!canManage}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-key">
            {t('project-settings.general.key')}
          </Label>
          <Input
            id="project-key"
            value={project.key}
            readOnly
            disabled
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            {t('project-settings.general.key-hint')}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-description">
            {t('project-settings.general.description-label')}
          </Label>
          <Input
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('project-settings.general.description-placeholder')}
            disabled={!canManage}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-type">
            {t('project-settings.general.type')}
          </Label>
          <Select
            value={type}
            onValueChange={(v) => setType(v as ProjectType)}
            disabled={!canManage}
          >
            <SelectTrigger id="project-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SINGLE">
                {t('project-settings.general.type-single')}
              </SelectItem>
              <SelectItem value="MULTI">
                {t('project-settings.general.type-multi')}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('project-settings.general.type-hint')}
          </p>
          {toSingle && brandCount === 'loading' && (
            <p role="status" className="text-xs text-muted-foreground">
              {t('project-settings.type-change.loading-brands')}
            </p>
          )}
          {toSingle && brandCount === 'failed' && (
            <p role="alert" className="text-xs text-destructive">
              {t('project-settings.type-change.brands-failed')}
            </p>
          )}
        </div>
        {canManage ? (
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving || !dirty || !name.trim() || waitingForBrands}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('project-settings.save')}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('project-settings.read-only')}
          </p>
        )}
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('project-settings.type-change.title')}
        description={
          typeof brandCount === 'number'
            ? t('project-settings.type-change.description', {
                count: brandCount,
              })
            : t('project-settings.type-change.description-unknown')
        }
        confirmLabel={t('project-settings.type-change.confirm')}
        onConfirm={save}
      />
    </SettingsSection>
  )
}
