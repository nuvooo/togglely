/**
 * Legacy import path of the dashboard API client. There is only one client
 * (`@/lib/api`: base URL from VITE_API_URL, JWT header, session expiry on
 * 401); this module re-exports it so both paths share the same instance.
 */
export { default } from './api'
