// Helpers for the flag history tab (GET /audit-logs/project/:projectId).

export interface AuditLogEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  oldValues?: unknown
  newValues?: unknown
  createdAt: string
  user?: {
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
  } | null
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/**
 * Entries that belong to the flag: the flag itself as entity, or a related
 * entity whose old/new values name the flag (`flagId`). The backend has no
 * entity filter, so this runs client-side.
 */
export function filterFlagLogs(
  logs: AuditLogEntry[],
  flagId: string
): AuditLogEntry[] {
  return logs.filter(
    (log) =>
      log.entityId === flagId ||
      asRecord(log.newValues)?.flagId === flagId ||
      asRecord(log.oldValues)?.flagId === flagId
  )
}

const formatValue = (value: unknown): string => {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Short "field: old → new" summary of a log entry. Fields present only in
 * the new values read "field: new", fields only in the old values "field: old".
 */
export function summarizeChanges(
  log: Pick<AuditLogEntry, 'oldValues' | 'newValues'>
): string {
  const oldValues = asRecord(log.oldValues) ?? {}
  const newValues = asRecord(log.newValues) ?? {}
  const keys = Array.from(
    new Set([...Object.keys(newValues), ...Object.keys(oldValues)])
  )
  return keys
    .filter((key) => key !== 'flagId')
    .map((key) => {
      const hasOld = key in oldValues
      const hasNew = key in newValues
      if (hasOld && hasNew) {
        return `${key}: ${formatValue(oldValues[key])} → ${formatValue(newValues[key])}`
      }
      return `${key}: ${formatValue(hasNew ? newValues[key] : oldValues[key])}`
    })
    .join(', ')
}

/** Display name of the acting user ("Ada Lovelace", falls back to the email). */
export function formatUser(user: AuditLogEntry['user']): string | null {
  if (!user) return null
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return name || user.email || null
}
