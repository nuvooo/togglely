import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { SettingsSection } from '@/components/page/SettingsSection'
import { Button } from '@/components/ui/button'
import { orgPath, ROUTES } from '@/lib/routes'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import type { ProjectDetails } from './project'

/** Deleting the project; confirmed by typing its key. */
export function DangerZone({ project }: { project: ProjectDetails }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

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

      <DeleteProjectDialog
        project={open ? project : null}
        onOpenChange={setOpen}
        onDeleted={() =>
          navigate(
            project.organizationId
              ? orgPath(project.organizationId)
              : ROUTES.orgs
          )
        }
      />
    </SettingsSection>
  )
}
