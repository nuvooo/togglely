import {
  FlagChange,
  FlagsChangedEvent,
} from '../change-events/change-events.types'

export type WebhookEventType = 'flags.changed' | 'webhook.test'

/** JSON body of every webhook request (stored as WebhookDelivery.event). */
export interface WebhookPayload {
  /** Event id; stays the same across retries and redeliveries */
  id: string
  type: WebhookEventType
  /** ISO timestamp of the change event */
  createdAt: string
  organizationId: string
  project: { id: string; key: string }
  environment: { id: string; key: string } | null
  version: number
  changes: FlagChange[]
  /** Present when the change list was capped */
  truncated?: boolean
}

export function buildChangedPayload(event: FlagsChangedEvent): WebhookPayload {
  return {
    id: event.eventId,
    type: 'flags.changed',
    createdAt: event.createdAt,
    organizationId: event.organizationId,
    project: { id: event.projectId, key: event.projectKey },
    environment: { id: event.environmentId, key: event.environmentKey },
    version: event.version,
    changes: event.changes,
    ...(event.truncated ? { truncated: true } : {}),
  }
}

/** Retry delays after the 1st, 2nd, ... failed attempt (seconds). */
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43200]

/** Consecutive failed attempts after which a webhook is disabled. */
export const AUTO_DISABLE_THRESHOLD = 20

/**
 * State of a delivery after its `attempt`-th attempt failed: another retry
 * per RETRY_DELAYS_SECONDS, or `failed` once the plan is exhausted.
 */
export function planAfterFailure(
  attempt: number,
  now: Date
): { status: 'pending' | 'failed'; nextAttemptAt: Date | null } {
  const delay = RETRY_DELAYS_SECONDS[attempt - 1]
  if (delay === undefined) return { status: 'failed', nextAttemptAt: null }
  return {
    status: 'pending',
    nextAttemptAt: new Date(now.getTime() + delay * 1000),
  }
}
