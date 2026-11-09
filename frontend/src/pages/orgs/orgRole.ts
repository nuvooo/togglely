import { hasRole } from '@/lib/permissions'
import { useWorkspace } from '@/lib/workspace'

/**
 * The organization (name, role) from the workspace cache. Backend rules:
 * VIEWER reads, ADMIN+ manages projects, members, API keys and settings,
 * only OWNERs delete the organization and change roles.
 */
export function useOrgRole(orgId: string) {
  const { organizations, isLoading, error } = useWorkspace()
  const organization = organizations.find((o) => o.id === orgId) ?? null
  const role = organization?.role
  return {
    organization,
    role,
    roleLoading: isLoading,
    /** The workspace failed to load: the role is unknown, writes are hidden. */
    roleUnavailable: !isLoading && Boolean(error) && !role,
    /** MEMBER+ may create (and delete their own) MCP keys. */
    canCreateMcp: hasRole(role, 'MEMBER'),
    canManage: hasRole(role, 'ADMIN'),
    isOwner: hasRole(role, 'OWNER'),
  }
}
