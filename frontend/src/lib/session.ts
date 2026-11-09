/**
 * Session expiry handling shared by the HTTP clients.
 *
 * Deliberately dependency-free: `lib/workspace` imports the axios client, so the
 * client cannot import workspace state directly. Instead the workspace cache and
 * store subscribe to {@link SESSION_EXPIRED_EVENT}.
 */
export const SESSION_EXPIRED_EVENT = 'togglely:session-expired'

const WORKSPACE_STORAGE_KEY = 'togglely-workspace'

const goToLogin = (path: string) => {
  window.location.href = path
}

/** Drops the token and all workspace context, then sends the user to the login page. */
export function expireSession(redirect: (path: string) => void = goToLogin) {
  // Listeners reset in-memory state first; persisted state is removed afterwards
  // so a store reset cannot write it back.
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  localStorage.removeItem('token')
  localStorage.removeItem(WORKSPACE_STORAGE_KEY)
  redirect('/login')
}

/** Subscribes to session expiry; returns an unsubscribe function. */
export function onSessionExpired(listener: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(SESSION_EXPIRED_EVENT, listener)
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
}
