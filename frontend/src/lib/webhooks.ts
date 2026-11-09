import type { TFunction } from 'i18next'
import api from '@/lib/axios'
import { getErrorCode, getErrorMessage, getErrorStatus } from '@/lib/errors'
import { refreshOnForbidden } from '@/lib/permissions'

export interface Webhook {
  id: string
  projectId: string
  url: string
  description: string | null
  /** Empty = all environments of the project */
  environmentIds: string[]
  enabled: boolean
  /** Always masked, e.g. `whsec_…abcd` */
  secret: string
  consecutiveFailures: number
  lastDeliveryAt: string | null
  lastStatus: 'success' | 'failed' | null
  createdAt: string
  updatedAt: string
}

export type DeliveryStatus = 'pending' | 'success' | 'failed'

export interface WebhookDelivery {
  id: string
  webhookId: string
  eventId: string
  type: 'flags.changed' | 'webhook.test'
  status: DeliveryStatus
  attempt: number
  responseCode: number | null
  responseBody: string | null
  error: string | null
  durationMs: number | null
  nextAttemptAt: string | null
  /** Sent by a person ("send test", "send again"); does not change the webhook's failure stats */
  manual: boolean
  createdAt: string
  updatedAt: string
  event: unknown
}

export interface ProjectEnvironment {
  id: string
  name: string
  key: string
}

export interface WebhookInput {
  url: string
  description?: string
  environmentIds?: string[]
  enabled?: boolean
}

/** Consecutive failures from which the list shows a warning. */
export const FAILURE_WARNING_THRESHOLD = 5

const base = (projectId: string) => `/projects/${projectId}/webhooks`

export const webhooksApi = {
  list: (projectId: string) =>
    api.get<{ webhooks: Webhook[] }>(base(projectId)).then((r) => r.data.webhooks ?? []),
  create: (projectId: string, input: WebhookInput) =>
    api.post<{ webhook: Webhook; secret: string }>(base(projectId), input).then((r) => r.data),
  update: (projectId: string, id: string, input: Partial<WebhookInput>) =>
    api.patch<{ webhook: Webhook }>(`${base(projectId)}/${id}`, input).then((r) => r.data.webhook),
  remove: (projectId: string, id: string) => api.delete(`${base(projectId)}/${id}`).then(() => undefined),
  rotateSecret: (projectId: string, id: string) =>
    api.post<{ webhook: Webhook; secret: string }>(`${base(projectId)}/${id}/rotate-secret`).then((r) => r.data),
  sendTest: (projectId: string, id: string) =>
    api.post<{ delivery: WebhookDelivery }>(`${base(projectId)}/${id}/test`).then((r) => r.data.delivery),
  deliveries: (projectId: string, id: string, limit = 50) =>
    api
      .get<{ deliveries: WebhookDelivery[] }>(`${base(projectId)}/${id}/deliveries`, { params: { limit } })
      .then((r) => r.data.deliveries ?? []),
  redeliver: (projectId: string, id: string, deliveryId: string) =>
    api
      .post<{ delivery: WebhookDelivery }>(`${base(projectId)}/${id}/deliveries/${deliveryId}/redeliver`)
      .then((r) => r.data.delivery),
  environments: (projectId: string) =>
    api
      .get<{ environments: ProjectEnvironment[] }>(`/environments/project/${projectId}`)
      .then((r) => r.data.environments ?? []),
}

/** API `code`s of failed create/update calls that have a friendly message. */
const API_ERROR_CODES = [
  'blocked_private_address',
  'insecure_scheme',
  'credentials_in_url',
  'invalid_url',
  'webhook_limit_reached',
  'environment_not_in_project',
] as const

/** Friendly message for a failed webhook API call. */
export function webhookErrorMessage(error: unknown, t: TFunction): string {
  const code = getErrorCode(error)
  if (code && (API_ERROR_CODES as readonly string[]).includes(code)) return t(`webhooks.error.${code}`)
  if (getErrorStatus(error) === 403) return t('webhooks.error.forbidden')
  if (getErrorStatus(error) === 409) return t('webhooks.error.in_flight')
  if (getErrorStatus(error) === 429) return t('webhooks.error.rate_limited')
  return getErrorMessage(error)
}

/**
 * Message for a failed write (create, update, test, …). A 403 means the role
 * known to the UI is stale: reload the workspace so the page drops write actions.
 */
export function writeErrorMessage(error: unknown, t: TFunction): string {
  refreshOnForbidden(error)
  return webhookErrorMessage(error, t)
}

const DELIVERY_ERRORS = [
  'blocked_private_address',
  'dns_error',
  'timeout',
  'redirect_not_followed',
  'unexpected_status',
  'connection_failed',
  'webhook_disabled',
  'insecure_scheme',
  'credentials_in_url',
  'invalid_url',
] as const

/** Human label for a delivery `error` (e.g. `connection_failed: ECONNREFUSED`). */
export function deliveryErrorLabel(error: string | null, t: TFunction): string | null {
  if (!error) return null
  const [head, ...rest] = error.split(':')
  const detail = rest.join(':').trim()
  if (!(DELIVERY_ERRORS as readonly string[]).includes(head)) return error
  const label = t(`webhooks.delivery-error.${head}`)
  return detail ? `${label} (${detail})` : label
}

/** Node.js receiver example: HMAC over `<t>.<rawBody>`, constant-time compare, 5 min tolerance. */
export const SIGNATURE_SNIPPET = `import crypto from 'node:crypto'

const TOLERANCE_SECONDS = 5 * 60

// rawBody: the unparsed request body, e.g. express.raw({ type: 'application/json' })
// header:  req.headers['x-togglely-signature']  ->  "t=<unix>,v1=<hex>"
export function verifyTogglelySignature(rawBody, header, secret) {
  const parts = Object.fromEntries(
    String(header ?? '').split(',').map((part) => part.trim().split('='))
  )
  const timestamp = Number(parts.t)
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) {
    return false // missing or too old: possible replay
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${parts.t}.\${rawBody}\`)
    .digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(String(parts.v1 ?? ''), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}`

/** Public SDK routes live next to the app (nginx / Vite proxy `/sdk`). */
export function sdkOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : ''
}

export function streamUrl(origin: string, projectKey: string, environmentKey: string) {
  return `${origin}/sdk/stream/${projectKey}/${environmentKey}`
}

export function flagsUrl(origin: string, projectKey: string, environmentKey: string) {
  return `${origin}/sdk/flags/${projectKey}/${environmentKey}`
}

/** Browser example: EventSource cannot send headers, so only a CLIENT key in the query string. */
export function eventSourceSnippet(origin: string, projectKey: string, environmentKey: string) {
  return `// Browser: use a CLIENT key only – SERVER keys never belong in the browser.
// EventSource cannot send headers, so the key goes into the query string
// (it may show up in proxy logs and browser history).
const stream = new EventSource(
  '${streamUrl(origin, projectKey, environmentKey)}?apiKey=YOUR_CLIENT_API_KEY'
)

stream.addEventListener('ready', (e) => {
  console.log('connected, version', JSON.parse(e.data).version)
})

stream.addEventListener('flags-changed', (e) => {
  const { version, changes } = JSON.parse(e.data)
  // Reload the flags (e.g. GET /sdk/flags/...) and update your cache
})`
}

/** Server example (Node.js 18+): read the stream with fetch and the `X-API-Key` header. */
export function serverStreamSnippet(origin: string, projectKey: string, environmentKey: string) {
  return `// Server (Node.js 18+): send the key as header, never in the URL
async function listen(onChange) {
  const res = await fetch('${streamUrl(origin, projectKey, environmentKey)}', {
    headers: { 'X-API-Key': process.env.TOGGLELY_API_KEY, Accept: 'text/event-stream' },
  })
  if (!res.ok) throw new Error(\`stream failed: \${res.status}\`)

  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let end
    while ((end = buffer.indexOf('\\n\\n')) !== -1) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1]
      if (event === 'flags-changed' && data) onChange(JSON.parse(data))
    }
  }
}

// Reconnect after 5 s when the connection ends or fails
function start() {
  listen(({ version }) => console.log('flags changed, version', version))
    .catch((err) => console.error(err))
    .finally(() => setTimeout(start, 5000))
}
start()`
}

export function etagSnippet(origin: string, projectKey: string, environmentKey: string) {
  const url = flagsUrl(origin, projectKey, environmentKey)
  return `# 1. First request: remember the ETag response header
curl -i -H 'X-API-Key: YOUR_API_KEY' '${url}'

# 2. Following requests: 304 Not Modified (empty body) until flags change
curl -i -H 'X-API-Key: YOUR_API_KEY' \\
  -H 'If-None-Match: <ETag value from step 1, e.g. W/"12-ab34…">' \\
  '${url}'`
}
