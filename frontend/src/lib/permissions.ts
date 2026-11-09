import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { refreshWorkspace, useWorkspace } from '@/lib/workspace'

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

const RANK: Record<OrgRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
}

/** True if `role` is at least `min` (unknown roles never are). */
export function hasRole(role: string | undefined, min: OrgRole): boolean {
  if (!role || !(role in RANK)) return false
  return RANK[role as OrgRole] >= RANK[min]
}

export const isForbidden = (error: unknown) => getErrorStatus(error) === 403

/**
 * A 403 on a write means the role known to the UI is stale: reload the
 * workspace so pages drop their write actions. Returns true for a 403.
 */
export function refreshOnForbidden(error: unknown): boolean {
  if (!isForbidden(error)) return false
  refreshWorkspace().catch(() => {})
  return true
}

/**
 * Like `refreshOnForbidden`, plus a "no permission" toast. For writes whose
 * error is shown elsewhere (dialogs); returns true for a 403.
 */
export function handleForbidden(error: unknown, t: TFunction): boolean {
  if (!refreshOnForbidden(error)) return false
  toast.error(t('permissions.forbidden'))
  return true
}

/**
 * Toasts a failed write: a 403 as "no permission" (and reloads the
 * workspace), anything else with `message` (default: the API message).
 */
export function notifyWriteError(
  error: unknown,
  t: TFunction,
  message?: string
): void {
  if (handleForbidden(error, t)) return
  toast.error(message ?? getErrorMessage(error))
}

/**
 * The user's role in the organization of `projectId`, from the workspace
 * cache. Backend rules: VIEWER reads, MEMBER edits flags and values, ADMIN+
 * changes project structure and deletes flags.
 */
export function useProjectRole(projectId: string | null | undefined) {
  const { projects, organizations, isLoading, error } = useWorkspace()
  const organizationId = projects.find(
    (p) => p.id === projectId
  )?.organizationId
  const role = organizations.find((o) => o.id === organizationId)?.role
  return {
    role,
    organizationId,
    roleLoading: isLoading,
    /** The workspace failed to load: the role is unknown, writes are hidden. */
    roleUnavailable: !isLoading && Boolean(error) && !role,
    canEdit: hasRole(role, 'MEMBER'),
    canManage: hasRole(role, 'ADMIN'),
  }
}
