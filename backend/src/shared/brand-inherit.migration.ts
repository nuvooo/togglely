import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import {
  claimMigrationMarker,
  completeMigrationMarker,
  releaseMigrationMarker,
} from './migration-marker'

export { STALE_MARKER_MS } from './migration-marker'

export const BRAND_INHERIT_MIGRATION_ID = 'brand-inherit-v1'
const BATCH_SIZE = 500

type MigrationClient = Pick<PrismaClient, '$runCommandRaw' | 'flagEnvironment'>

/**
 * Brand rows were materialized as copies of the environment default on the
 * first SDK/dashboard read, which froze brands at the default's old value.
 * Brands now inherit the default live, so delete the brand rows that are
 * identical to their environment default (`enabled` + `defaultValue`) and
 * carry no targeting rules — those are the automatic copies. Real overrides
 * (different value or own rules) are kept.
 *
 * Runs once (marker document in `migrations`, `completedAt` set on success;
 * an unfinished marker older than 15 minutes is retried). Each delete matches
 * the row exactly as it was read, so a row edited meanwhile is kept. Returns
 * the number of deleted rows, or null when it was skipped.
 */
export async function migrateBrandInheritance(
  prisma: MigrationClient,
  logger: Pick<Logger, 'log'> = new Logger('BrandInheritMigration')
): Promise<number | null> {
  if (!(await claimMigrationMarker(prisma, BRAND_INHERIT_MIGRATION_ID))) {
    return null
  }

  try {
    let deleted = 0
    let cursor: string | undefined
    for (;;) {
      const brandRows = await prisma.flagEnvironment.findMany({
        // Keyset paging (`id > last`), robust against rows deleted meanwhile
        where: {
          brandId: { not: null },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: {
          id: true,
          brandId: true,
          flagId: true,
          environmentId: true,
          enabled: true,
          defaultValue: true,
          targetingRules: { select: { id: true }, take: 1 },
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      })
      if (brandRows.length === 0) break
      cursor = brandRows[brandRows.length - 1].id

      const defaults = await prisma.flagEnvironment.findMany({
        where: {
          brandId: null,
          flagId: { in: [...new Set(brandRows.map((r) => r.flagId))] },
        },
        select: {
          flagId: true,
          environmentId: true,
          enabled: true,
          defaultValue: true,
        },
      })
      const defaultByKey = new Map(
        defaults.map((d) => [`${d.flagId}:${d.environmentId}`, d])
      )

      const copies = brandRows.filter((row) => {
        const def = defaultByKey.get(`${row.flagId}:${row.environmentId}`)
        return (
          !!def &&
          row.brandId !== null &&
          row.targetingRules.length === 0 &&
          row.enabled === def.enabled &&
          row.defaultValue === def.defaultValue
        )
      })

      if (copies.length > 0) {
        // Match each row as read: one edited in between no longer matches.
        const result = await prisma.flagEnvironment.deleteMany({
          where: {
            OR: copies.map((row) => ({
              id: row.id,
              brandId: row.brandId,
              flagId: row.flagId,
              environmentId: row.environmentId,
              enabled: row.enabled,
              defaultValue: row.defaultValue,
              targetingRules: { none: {} },
            })),
          },
        })
        deleted += result.count
      }
      if (brandRows.length < BATCH_SIZE) break
    }

    await completeMigrationMarker(prisma, BRAND_INHERIT_MIGRATION_ID, {
      deleted,
    })
    logger.log(
      `Brand inheritance migration: removed ${deleted} brand rows identical to their environment default`
    )
    return deleted
  } catch (error) {
    // Release the marker so the next boot retries.
    await releaseMigrationMarker(prisma, BRAND_INHERIT_MIGRATION_ID)
    throw error
  }
}
