import { Logger } from '@nestjs/common'
import { AuditLogsService } from './audit-logs.service'

type AuditEntry = Parameters<AuditLogsService['create']>[0]

/**
 * Writes an audit entry after a mutation has already succeeded. A failing
 * audit write must not turn that success into an error response (the client
 * would retry a change that was applied), so it is logged instead.
 */
export async function writeAudit(
  auditLogs: AuditLogsService,
  logger: Logger,
  entry: AuditEntry
): Promise<void> {
  try {
    await auditLogs.create(entry)
  } catch (error) {
    logger.error(
      `Audit log "${entry.action}" for ${entry.entityType} ${entry.entityId} failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
