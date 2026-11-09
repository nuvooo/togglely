import { OrganizationInvite, Prisma } from '@prisma/client'

/** Invite links are valid for 7 days. */
export const INVITE_TTL_DAYS = 7

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

/**
 * Matches invites where `field` is null *or missing*. Invites created before
 * `revokedAt` existed have no such field, and Prisma's `{ field: null }`
 * filter on MongoDB does not match missing fields.
 */
function isUnset(
  field: 'acceptedAt' | 'revokedAt'
): Prisma.OrganizationInviteWhereInput {
  return { OR: [{ [field]: null }, { [field]: { isSet: false } }] }
}

/** Invites that are neither accepted nor revoked (expiry checked separately). */
export function openInviteWhere(): Prisma.OrganizationInviteWhereInput {
  return { AND: [isUnset('acceptedAt'), isUnset('revokedAt')] }
}

export function inviteStatus(
  invite: Pick<OrganizationInvite, 'acceptedAt' | 'revokedAt' | 'expiresAt'>,
  now: Date = new Date()
): InviteStatus {
  if (invite.acceptedAt) return 'accepted'
  if (invite.revokedAt) return 'revoked'
  if (invite.expiresAt <= now) return 'expired'
  return 'pending'
}
