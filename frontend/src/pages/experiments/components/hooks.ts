import { useParams, useSearchParams } from 'react-router-dom'
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

const WRITE_ROLES = ['OWNER', 'ADMIN', 'MEMBER']
const DELETE_ROLES = ['OWNER', 'ADMIN']

/**
 * Mirrors the backend checks: MEMBER+ creates, starts, pauses and completes;
 * ADMIN+ deletes. `roleLoading` is true until the role is known.
 */
export function useExperimentPermissions(projectId: string) {
  const { projects, organizations, isLoading } = useWorkspace()
  const orgId = projects.find((p) => p.id === projectId)?.organizationId
  const role = organizations.find((o) => o.id === orgId)?.role ?? ''
  return {
    canEdit: WRITE_ROLES.includes(role),
    canDelete: DELETE_ROLES.includes(role),
    roleLoading: isLoading,
    projectName: projects.find((p) => p.id === projectId)?.name,
  }
}
