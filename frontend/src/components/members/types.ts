export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export interface Member {
  id: string
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  name?: string
  role: OrgRole
  joinedAt: string
}

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

/** An invite as listed by `GET /organizations/:id/invites` (never with a token). */
export interface OrgInvite {
  id: string
  /** `null` for open links that are not bound to an address. */
  email: string | null
  role: OrgRole
  status: InviteStatus
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

/** Response of `POST /organizations/:id/invites`. */
export interface CreatedInvite {
  invite: { id: string; email: string | null; role: OrgRole; expiresAt: string }
  /** Absolute link; the token is only ever returned here. */
  inviteUrl: string
  emailSent: boolean
}

/** Roles `actorRole` may hand out (mirrors the backend's assertCanGrantRole). */
export function grantableRoles(actorRole: OrgRole | null): OrgRole[] {
  if (actorRole === 'OWNER') return ['ADMIN', 'MEMBER', 'VIEWER']
  if (actorRole === 'ADMIN') return ['MEMBER', 'VIEWER']
  return []
}

export const memberName = (m: Pick<Member, 'firstName' | 'lastName' | 'email' | 'name'>) =>
  [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || m.name || m.email
