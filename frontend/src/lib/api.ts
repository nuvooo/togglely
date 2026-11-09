import axios from 'axios'
import { expireSession, getSessionToken } from './session'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Endpoints for logged-out visitors. They never carry the (possibly stale)
 * session token, and their 401s (wrong password, bad invite) are form errors,
 * not an expired session.
 */
const PUBLIC_ENDPOINTS: RegExp[] = [
  /^\/auth\/(login|register|resend-verification)$/,
  /^\/auth\/verify-email\/[^/]+$/,
  /^\/auth\/invite\/[^/]+(\/register)?$/,
  /^\/setup(\/status)?$/,
  /^\/password-reset(\/.*)?$/,
]

/** Whether `url` (relative to the API base) is a public auth endpoint. */
export function isPublicEndpoint(url: string | undefined): boolean {
  if (!url) return false
  const path = url.split('?')[0].replace(/^\/?/, '/')
  return PUBLIC_ENDPOINTS.some((pattern) => pattern.test(path))
}

api.interceptors.request.use((config) => {
  const token = getSessionToken()
  if (token && !isPublicEndpoint(config.url)) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 ends the session whenever one exists (or the request carried
    // one); public endpoints answer 401 for wrong input and keep the page.
    const sentSession =
      Boolean(error.config?.headers?.Authorization) || getSessionToken() !== null
    if (
      error.response?.status === 401 &&
      !isPublicEndpoint(error.config?.url) &&
      sentSession
    ) {
      expireSession()
    }
    return Promise.reject(error)
  }
)

export default api
