import { ForbiddenException } from '@nestjs/common'
import { OrganizationRole } from '@prisma/client'

/** Roles that only an OWNER may grant, revoke or manage. */
export const PRIVILEGED_ROLES: ReadonlySet<OrganizationRole> =
  new Set<OrganizationRole>(['OWNER', 'ADMIN'])

/**
 * Throws unless `actorRole` may hand out `role` to someone else.
 * ADMINs may only grant MEMBER/VIEWER; only OWNERs may grant ADMIN/OWNER.
 */
export function assertCanGrantRole(
  actorRole: OrganizationRole,
  role: OrganizationRole
) {
  if (PRIVILEGED_ROLES.has(role) && actorRole !== 'OWNER') {
    throw new ForbiddenException(
      'Only owners can grant the ADMIN or OWNER role'
    )
  }
}
