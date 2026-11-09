import { Loader2, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { notifyWriteError } from '@/lib/permissions'
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
import api from '@/lib/axios'
import { orgPath, ROUTES } from '@/lib/routes'
import { refreshWorkspace } from '@/lib/workspace'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { apiMessage, type ProjectDetails } from './project'
import { SettingsSection } from './SettingsSection'

/** Deleting the project; confirmed by typing its key. */
export function DangerZone({ project }: { project: ProjectDetails }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const matches = typed.trim() === project.key

  const remove = async (event: FormEvent) => {
    event.preventDefault()
    if (!matches) return
    setBusy(true)
    try {
      await api.delete(`/projects/${project.id}`)
      // The rail must not point at the deleted project.
      useWorkspaceStore.getState().forgetProject(project.id)
      // Keep the workspace switcher in sync.
      refreshWorkspace().catch(() => {})
      toast.success(
        t('project-settings.danger.deleted', { name: project.name })
      )
      navigate(
        project.organizationId ? orgPath(project.organizationId) : ROUTES.orgs
      )
    } catch (error) {
      notifyWriteError(
        error,
        t,
        apiMessage(error, t('project-settings.danger.delete-failed'))
      )
      setBusy(false)
    }
  }

  return (
    <SettingsSection
      danger
      title={t('project-settings.danger.title')}
      description={t('project-settings.danger.description')}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {t('project-settings.danger.delete-title')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('project-settings.danger.delete-text')}
          </p>
        </div>
        <Button
          variant="destructive"
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('project-settings.danger.delete')}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('project-settings.danger.confirm-title', {
                name: project.name,
              })}
            </DialogTitle>
            <DialogDescription>
              {t('project-settings.danger.confirm-text')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={remove} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-project-key">
                {t('project-settings.danger.confirm-label', {
                  key: project.key,
                })}
              </Label>
              <Input
                id="delete-project-key"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                placeholder={project.key}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!matches || busy}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('project-settings.danger.delete')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}
