import { BadRequestException } from '@nestjs/common'
import { isObjectId } from '../../shared/access/access.service'

export const ORG_AUDIT_LOG_DEFAULT_LIMIT = 50
export const ORG_AUDIT_LOG_MAX_LIMIT = 200

/** Action prefixes: lower-case words, `_` and `.` only (no regex characters). */
const ACTION_PATTERN = /^[a-z_.]{1,64}$/
/** Cursor format returned as `nextCursor`: an ISO timestamp in UTC. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

/** Filters of `GET /audit-logs/organization/:organizationId`. */
export interface OrgAuditLogQuery {
  /** Page size, 1–200 (default 50). */
  limit?: number
  /** Only entries strictly older than this (the previous page's `nextCursor`). */
  before?: Date
  projectId?: string
  userId?: string
  /** Prefix of the action, e.g. `flag.` or `webhook.created`. */
  action?: string
}

function single(
  raw: Record<string, unknown>,
  name: string
): string | undefined {
  const value = raw[name]
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') {
    throw new BadRequestException(`${name} must be a single value`)
  }
  return value
}

/** Validates the raw query string of the organization audit log. */
export function parseOrgAuditLogQuery(
  raw: Record<string, unknown>
): OrgAuditLogQuery {
  const query: OrgAuditLogQuery = {}

  const limit = single(raw, 'limit')
  if (limit !== undefined) {
    const value = Number(limit)
    if (
      !/^\d+$/.test(limit) ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > ORG_AUDIT_LOG_MAX_LIMIT
    ) {
      throw new BadRequestException(
        `limit must be an integer between 1 and ${ORG_AUDIT_LOG_MAX_LIMIT}`
      )
    }
    query.limit = value
  }

  const before = single(raw, 'before')
  if (before !== undefined) {
    const date = new Date(before)
    if (!ISO_TIMESTAMP.test(before) || Number.isNaN(date.getTime())) {
      throw new BadRequestException('before must be an ISO timestamp')
    }
    query.before = date
  }

  for (const name of ['projectId', 'userId'] as const) {
    const value = single(raw, name)
    if (value === undefined) continue
    if (!isObjectId(value)) {
      throw new BadRequestException(`${name} must be an ObjectId`)
    }
    query[name] = value
  }

  const action = single(raw, 'action')
  if (action !== undefined) {
    if (!ACTION_PATTERN.test(action)) {
      throw new BadRequestException(
        'action must be 1-64 characters of a-z, "_" and "."'
      )
    }
    query.action = action
  }

  return query
}
