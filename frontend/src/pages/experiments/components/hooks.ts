import { useParams, useSearchParams } from 'react-router-dom'
import { useProjectRole } from '@/lib/permissions'
import { useWorkspace } from '@/lib/workspace'

/**
 * Project of the current experiment page: the route param first, `?projectId=` as a
 * fallback (pages mounted outside the project routes, e.g. in tests).
 */
export function useExperimentProjectId(): string {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  return projectId || searchParams.get('projectId') || ''
}

/**
 * Mirrors the backend checks: MEMBER+ creates, starts, pauses and completes;
 * ADMIN+ deletes. `roleLoading` is true until the role is known.
 */
export function useExperimentPermissions(projectId: string) {
  const { projects } = useWorkspace()
  const { canEdit, canManage, roleLoading, roleUnavailable } =
    useProjectRole(projectId)
  return {
    canEdit,
    canDelete: canManage,
    roleLoading,
    /** The workspace failed to load: show `RoleUnavailableNotice`. */
    roleUnavailable,
    projectName: projects.find((p) => p.id === projectId)?.name,
  }
}
