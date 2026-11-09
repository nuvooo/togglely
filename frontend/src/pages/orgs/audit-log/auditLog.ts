// Helpers for the organization audit log (GET /audit-logs/organization/:orgId).
import type { TFunction } from 'i18next'

export interface OrgAuditLogEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  projectId?: string | null
  userId?: string | null
  oldValues?: unknown
  newValues?: unknown
  createdAt: string
  user?: {
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
  } | null
  project?: { id: string; name: string; key: string } | null
}

export interface OrgAuditLogPage {
  auditLogs: OrgAuditLogEntry[]
  nextCursor: string | null
}

export interface AuditLogFilters {
  projectId: string
  userId: string
  /** Action prefix (`flag.`), empty for all. */
  action: string
}

export const AUDIT_PAGE_SIZE = 50

/**
 * Actions written by the backend that have a translated label
 * (`org-pages.audit.action.<action>`, dots as `-`). Others are shown raw.
 */
export const KNOWN_ACTIONS = [
  'flag.created',
  'flag.updated',
  'flag.deleted',
  'flag.toggled',
  'flag.value_updated',
  'flag.environment_updated',
  'flag.brand_toggled',
  'flag.brand_override_reset',
  'targeting_rule.created',
  'targeting_rule.updated',
  'targeting_rule.deleted',
  'environment.created',
  'environment.updated',
  'environment.deleted',
  'environment.reordered',
  'brand.created',
  'brand.updated',
  'brand.deleted',
  'experiment.created',
  'experiment.started',
  'experiment.paused',
  'experiment.completed',
  'experiment.deleted',
  'webhook.created',
  'webhook.updated',
  'webhook.deleted',
  'webhook.secret_rotated',
  'webhook.auto_disabled',
  'webhook.disabled_environment_deleted',
  'invite.created',
  'invite.accepted',
  'invite.revoked',
  'user.password_reset_link_created',
  'user.password_reset_link_created_by_operator',
] as const

const KNOWN = new Set<string>(KNOWN_ACTIONS)

/** Action groups offered as filter (backend matches them as prefix). */
export const ACTION_FILTERS = [
  'flag.',
  'targeting_rule.',
  'environment.',
  'brand.',
  'experiment.',
  'webhook.',
  'invite.',
  'user.',
] as const

/** i18n key part of an action: dots would nest keys, so they become `-`. */
const keyOf = (action: string) => action.replace(/\./g, '-')

/** Translated label of a known action, otherwise the raw action. */
export function formatAction(action: string, t: TFunction): string {
  if (!KNOWN.has(action)) return action
  return t(`org-pages.audit.action.${keyOf(action)}`)
}

/** Translated label of an action filter group (`flag.` → "Flags"). */
export function formatActionFilter(prefix: string, t: TFunction): string {
  return t(`org-pages.audit.group.${prefix.replace(/[._]+$/, '')}`)
}

/** Query parameters for one page; empty filters are left out. */
export function buildAuditParams(
  filters: AuditLogFilters,
  before?: string | null
): Record<string, string | number> {
  const params: Record<string, string | number> = { limit: AUDIT_PAGE_SIZE }
  if (before) params.before = before
  if (filters.projectId) params.projectId = filters.projectId
  if (filters.userId) params.userId = filters.userId
  if (filters.action) params.action = filters.action
  return params
}

/** Appends a page, skipping entries already shown. */
export function appendPage(
  current: OrgAuditLogEntry[],
  next: OrgAuditLogEntry[]
): OrgAuditLogEntry[] {
  const seen = new Set(current.map((log) => log.id))
  return [...current, ...next.filter((log) => !seen.has(log.id))]
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/**
 * Human readable name of the changed object, taken from the logged values
 * (`name`, `key`, `flagKey`, `email`); falls back to the entity id.
 */
export function describeEntity(log: OrgAuditLogEntry): string {
  for (const values of [asRecord(log.newValues), asRecord(log.oldValues)]) {
    if (!values) continue
    for (const field of ['name', 'key', 'flagKey', 'email', 'url']) {
      const value = values[field]
      if (typeof value === 'string' && value) return value
    }
  }
  return log.entityId
}

/** Pretty JSON of old/new values; `null` when there is nothing to show. */
export function formatValues(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'object' && Object.keys(value).length === 0) return null
  return JSON.stringify(value, null, 2)
}

/** Display name of the acting user ("Ada Lovelace", falls back to the email). */
export function formatAuditUser(user: OrgAuditLogEntry['user']): string | null {
  if (!user) return null
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return name || user.email || null
}

/** A user from GET /audit-logs/organization/:orgId/users. */
export interface AuditLogUser {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  /** False for users removed from the organization since. */
  isMember: boolean
}

export interface AuditUserOption {
  id: string
  label: string
  /** Removed from the organization; still filterable for old entries. */
  former: boolean
}

/**
 * Options of the user filter: the users of the log (members and former
 * members) plus anyone named in the loaded entries, sorted by label.
 */
export function auditUserOptions(
  users: AuditLogUser[],
  logs: OrgAuditLogEntry[]
): AuditUserOption[] {
  const options = new Map<string, AuditUserOption>()
  for (const user of users) {
    options.set(user.id, {
      id: user.id,
      label: formatAuditUser(user) ?? user.id,
      former: !user.isMember,
    })
  }
  for (const log of logs) {
    if (!log.user || options.has(log.user.id)) continue
    options.set(log.user.id, {
      id: log.user.id,
      label: formatAuditUser(log.user) ?? log.user.id,
      former: false,
    })
  }
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label))
}
