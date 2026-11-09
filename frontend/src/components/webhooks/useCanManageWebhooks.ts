import { useWorkspace } from '@/lib/workspace'

/**
 * Webhooks may be changed by ADMIN+ of the project's organization; MEMBER only reads.
 * `roleLoading` is true until the role is known, so pages can stay neutral meanwhile.
 */
export function useCanManageWebhooks(projectId: string): { canManage: boolean; roleLoading: boolean } {
  const { projects, organizations, isLoading } = useWorkspace()
  const orgId = projects.find((p) => p.id === projectId)?.organizationId
  const role = organizations.find((o) => o.id === orgId)?.role
  return { canManage: role === 'OWNER' || role === 'ADMIN', roleLoading: isLoading }
}
