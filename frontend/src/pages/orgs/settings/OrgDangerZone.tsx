import { Loader2, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { SettingsSection } from '@/components/page/SettingsSection'
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
import { ROUTES } from '@/lib/routes'
import { refreshWorkspace, useWorkspace } from '@/lib/workspace'
import { apiMessage } from '@/pages/projects/settings/project'
import { useWorkspaceStore } from '@/store/workspaceStore'

/** Deleting the organization (OWNER only); confirmed by typing its name. */
export function OrgDangerZone({ org }: { org: { id: string; name: string } }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectsByOrg } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const matches = typed.trim() === org.name.trim()

  const remove = async (event: FormEvent) => {
    event.preventDefault()
    if (!matches) return
    setBusy(true)
    // The org's projects are deleted with it: read them before the reload.
    const projectIds = projectsByOrg(org.id).map((p) => p.id)
    try {
      await api.delete(`/organizations/${org.id}`)
      // The rail must not point at the deleted org or one of its projects.
      useWorkspaceStore.getState().forgetOrg(org.id, projectIds)
      refreshWorkspace().catch(() => {})
      toast.success(t('org-pages.settings.deleted', { name: org.name }))
      navigate(ROUTES.orgs)
    } catch (error) {
      notifyWriteError(
        error,
        t,
        apiMessage(error, t('org-pages.settings.delete-failed'))
      )
      setBusy(false)
    }
  }

  return (
    <SettingsSection
      danger
      title={t('org-pages.settings.danger-title')}
      description={t('org-pages.settings.danger-description')}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {t('org-pages.settings.delete-title')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('org-pages.settings.delete-text')}
          </p>
        </div>
        <Button
          variant="destructive"
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('org-pages.settings.delete')}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('org-pages.settings.confirm-title', { name: org.name })}
            </DialogTitle>
            <DialogDescription>
              {t('org-pages.settings.confirm-text')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={remove} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-org-name">
                {t('org-pages.settings.confirm-label', { name: org.name })}
              </Label>
              <Input
                id="delete-org-name"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={org.name}
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
                {t('org-pages.settings.delete')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}
