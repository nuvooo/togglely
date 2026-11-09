/**
 * Session handling shared by the HTTP client and the auth store.
 *
 * Deliberately dependency-free: the auth store and `lib/workspace` import the
 * axios client, so the client cannot import them. The client reads the token
 * the auth store persists ({@link getSessionToken}); the stores subscribe to
 * {@link SESSION_EXPIRED_EVENT} to reset their in-memory state.
 */
export const SESSION_EXPIRED_EVENT = 'togglely:session-expired'

/** localStorage key of the persisted auth store (zustand `persist`). */
export const AUTH_STORAGE_KEY = 'auth-storage'
const WORKSPACE_STORAGE_KEY = 'togglely-workspace'
/** Token key written by older builds; only cleaned up. */
const LEGACY_TOKEN_KEY = 'token'

const goToLogin = (path: string) => {
  window.location.href = path
}

/** The token of the persisted auth store, the single source of the session. */
export function getSessionToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const token = JSON.parse(raw)?.state?.token
    return typeof token === 'string' && token ? token : null
  } catch {
    return null
  }
}

/** Drops the session and all workspace context, then sends the user to the login page. */
export function expireSession(redirect: (path: string) => void = goToLogin) {
  // Listeners (auth + workspace stores) reset in-memory state first; persisted
  // state is removed afterwards so a store reset cannot write it back.
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  localStorage.removeItem(AUTH_STORAGE_KEY)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  localStorage.removeItem(WORKSPACE_STORAGE_KEY)
  redirect('/login')
}

/** Subscribes to session expiry; returns an unsubscribe function. */
export function onSessionExpired(listener: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(SESSION_EXPIRED_EVENT, listener)
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
}
