import { useWorkspace } from '@/lib/workspace'

/** Webhooks may be changed by ADMIN+ of the project's organization; MEMBER only reads. */
export function useCanManageWebhooks(projectId: string): boolean {
  const { projects, organizations } = useWorkspace()
  const orgId = projects.find((p) => p.id === projectId)?.organizationId
  const role = organizations.find((o) => o.id === orgId)?.role
  return role === 'OWNER' || role === 'ADMIN'
}
