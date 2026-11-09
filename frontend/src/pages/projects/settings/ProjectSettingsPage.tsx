import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { ErrorState } from '@/components/feedback/ErrorState'
import { RoleUnavailableNotice } from '@/components/feedback/RoleUnavailableNotice'
import { PageHeader } from '@/components/page/PageHeader'
import { SettingsSection } from '@/components/page/SettingsSection'
import { Skeleton } from '@/components/ui/skeleton'
import { IntegrationCard } from '@/components/webhooks/IntegrationCard'
import api from '@/lib/axios'
import { DangerZone } from './DangerZone'
import { type BrandCount, GeneralSection } from './GeneralSection'
import { OriginsSection } from './OriginsSection'
import {
  fetchProject,
  type ProjectDetails,
  useCanManageProject,
} from './project'

export default function ProjectSettingsPage() {
  const { t } = useTranslation()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const { canManage, roleLoading, roleUnavailable } =
    useCanManageProject(projectId)
  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [brandCount, setBrandCount] = useState<BrandCount>(0)
  const loadId = useRef(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  /**
   * Brand count of a MULTI project. Only needed to warn before converting to
   * SINGLE; saving a type change waits for it.
   */
  const loadBrandCount = useCallback(
    (current: () => boolean) => {
      setBrandCount('loading')
      api
        .get(`/brands/project/${projectId}`)
        .then((response) => {
          if (current()) setBrandCount((response.data.brands ?? []).length)
        })
        .catch(() => {
          if (current()) setBrandCount('failed')
        })
    },
    [projectId]
  )

  const load = useCallback(async () => {
    const id = ++loadId.current
    const current = () => id === loadId.current
    setIsLoading(true)
    setLoadError(false)
    try {
      const loaded = await fetchProject(projectId)
      if (!current()) return
      setProject(loaded)
      if (loaded.type === 'MULTI') loadBrandCount(current)
      else setBrandCount(0)
    } catch {
      if (current()) setLoadError(true)
    } finally {
      if (current()) setIsLoading(false)
    }
  }, [projectId, loadBrandCount])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  const onSaved = (saved: ProjectDetails) => {
    const wasMulti = project?.type === 'MULTI'
    setProject(saved)
    // Brands survive a conversion to SINGLE: count them again when the
    // project becomes MULTI (again).
    if (saved.type === 'MULTI' && !wasMulti) {
      const id = loadId.current
      loadBrandCount(() => id === loadId.current)
    }
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
      <RoleUnavailableNotice show={roleUnavailable} />
      {content}
    </div>
  )
}
