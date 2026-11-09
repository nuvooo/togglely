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
import api from '@/lib/axios'
import { notifyWriteError } from '@/lib/permissions'
import { refreshWorkspace } from '@/lib/workspace'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { apiMessage } from './project'

export interface DeletableProject {
  id: string
  name: string
  key: string
}

interface DeleteProjectDialogProps {
  /** The project to delete; the dialog is closed while null. */
  project: DeletableProject | null
  onOpenChange: (open: boolean) => void
  /** Called after the project was deleted (workspace already updated). */
  onDeleted: (project: DeletableProject) => void
}

/**
 * Confirms deleting a project by typing its key, deletes it and keeps the
 * workspace (rail, switcher) in sync. Used by the project danger zone and the
 * organization's project list.
 */
export function DeleteProjectDialog({
  project,
  onOpenChange,
  onDeleted,
}: DeleteProjectDialogProps) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const open = project !== null

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const matches = project !== null && typed.trim() === project.key

  const remove = async (event: FormEvent) => {
    event.preventDefault()
    if (!project || !matches) return
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
      setBusy(false)
      onDeleted(project)
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
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('project-settings.danger.confirm-title', {
              name: project?.name ?? '',
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
                key: project?.key ?? '',
              })}
            </Label>
            <Input
              id="delete-project-key"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              placeholder={project?.key}
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
  )
}
