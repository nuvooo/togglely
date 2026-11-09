import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

export const BRAND_INHERIT_MIGRATION_ID = 'brand-inherit-v1'
const BATCH_SIZE = 500
/** An unfinished marker older than this belongs to a killed process. */
export const STALE_MARKER_MS = 15 * 60_000

type MigrationClient = Pick<PrismaClient, '$runCommandRaw' | 'flagEnvironment'>

function isDuplicateKey(value: unknown): boolean {
  const text =
    value instanceof Error ? value.message : JSON.stringify(value ?? '')
  return /E11000|duplicate key|"code":\s*11000/i.test(text)
}

const mongoDate = (date: Date) => ({ $date: date.toISOString() })

/**
 * Takes over an existing marker that never completed and is older than
 * STALE_MARKER_MS (the process running it was killed). The conditional update
 * is atomic, so only one instance wins the takeover.
 */
async function takeOverStaleMarker(prisma: MigrationClient): Promise<boolean> {
  const now = new Date()
  const result = (await prisma.$runCommandRaw({
    update: 'migrations',
    updates: [
      {
        q: {
          _id: BRAND_INHERIT_MIGRATION_ID,
          completedAt: { $exists: false },
          startedAt: {
            $lt: mongoDate(new Date(now.getTime() - STALE_MARKER_MS)),
          },
        },
        u: { $set: { startedAt: mongoDate(now) } },
      },
    ],
  })) as { n?: number }
  return (result?.n ?? 0) > 0
}

/**
 * Claims the one-time marker. Returns false when the migration already ran
 * or another instance is running it (the marker insert hits a duplicate key
 * and the existing marker is completed or still fresh).
 */
async function claimMarker(prisma: MigrationClient): Promise<boolean> {
  try {
    const result = (await prisma.$runCommandRaw({
      insert: 'migrations',
      documents: [
        { _id: BRAND_INHERIT_MIGRATION_ID, startedAt: mongoDate(new Date()) },
      ],
    })) as { writeErrors?: unknown[] }
    if (result?.writeErrors?.length) {
      if (isDuplicateKey(result.writeErrors)) {
        return takeOverStaleMarker(prisma)
      }
      throw new Error(JSON.stringify(result.writeErrors))
    }
    return true
  } catch (error) {
    if (isDuplicateKey(error)) return takeOverStaleMarker(prisma)
    throw error
  }
}

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
  if (!(await claimMarker(prisma))) return null

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

    await prisma.$runCommandRaw({
      update: 'migrations',
      updates: [
        {
          q: { _id: BRAND_INHERIT_MIGRATION_ID },
          u: {
            $set: {
              completedAt: mongoDate(new Date()),
              deleted,
            },
          },
        },
      ],
    })
    logger.log(
      `Brand inheritance migration: removed ${deleted} brand rows identical to their environment default`
    )
    return deleted
  } catch (error) {
    // Release the marker so the next boot retries.
    await prisma
      .$runCommandRaw({
        delete: 'migrations',
        deletes: [{ q: { _id: BRAND_INHERIT_MIGRATION_ID }, limit: 1 }],
      })
      .catch(() => undefined)
    throw error
  }
}
