import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageHeader } from '@/components/page/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { IntegrationCard } from '@/components/webhooks/IntegrationCard'
import api from '@/lib/axios'
import { DangerZone } from './DangerZone'
import { GeneralSection } from './GeneralSection'
import { OriginsSection } from './OriginsSection'
import {
  fetchProject,
  type ProjectDetails,
  useCanManageProject,
} from './project'
import { SettingsSection } from './SettingsSection'

export default function ProjectSettingsPage() {
  const { t } = useTranslation()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const { canManage, roleLoading } = useCanManageProject(projectId)
  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [brandCount, setBrandCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const loaded = await fetchProject(projectId)
      setProject(loaded)
      setBrandCount(0)
      if (loaded.type === 'MULTI') {
        // Only needed to warn before converting to SINGLE.
        api
          .get(`/brands/project/${projectId}`)
          .then((response) =>
            setBrandCount((response.data.brands ?? []).length)
          )
          .catch(() => {})
      }
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  const onSaved = (saved: ProjectDetails) => {
    setProject(saved)
    if (saved.type === 'SINGLE') setBrandCount(0)
  }

  let content: React.ReactNode
  if (isLoading || roleLoading) {
    content = (
      <div className="space-y-8" aria-busy="true">
        <span role="status" className="sr-only">
          {t('common.loading')}
        </span>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-40 w-full" />
          </div>
        ))}
      </div>
    )
  } else if (loadError || !project) {
    content = (
      <ErrorState message={t('project-settings.load-error')} onRetry={load} />
    )
  } else {
    content = (
      <div className="space-y-10">
        <GeneralSection
          project={project}
          canManage={canManage}
          brandCount={brandCount}
          onSaved={onSaved}
        />
        <OriginsSection
          project={project}
          canManage={canManage}
          onSaved={onSaved}
        />
        <SettingsSection
          title={t('project-settings.integration.title')}
          description={t('project-settings.integration.description')}
        >
          <IntegrationCard
            projectId={project.id}
            projectKey={project.key}
            environments={project.environments ?? []}
          />
        </SettingsSection>
        {canManage && <DangerZone project={project} />}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('project-settings.title')}
        description={t('project-settings.subtitle')}
      />
      {content}
    </div>
  )
}
