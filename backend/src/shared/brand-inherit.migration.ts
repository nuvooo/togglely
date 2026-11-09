import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

export const BRAND_INHERIT_MIGRATION_ID = 'brand-inherit-v1'
const BATCH_SIZE = 500

type MigrationClient = Pick<PrismaClient, '$runCommandRaw' | 'flagEnvironment'>

function isDuplicateKey(value: unknown): boolean {
  const text =
    value instanceof Error ? value.message : JSON.stringify(value ?? '')
  return /E11000|duplicate key|"code":\s*11000/i.test(text)
}

/**
 * Claims the one-time marker. Returns false when the migration already ran
 * (or another instance is running it): the marker insert hits a duplicate key.
 */
async function claimMarker(prisma: MigrationClient): Promise<boolean> {
  try {
    const result = (await prisma.$runCommandRaw({
      insert: 'migrations',
      documents: [
        {
          _id: BRAND_INHERIT_MIGRATION_ID,
          startedAt: { $date: new Date().toISOString() },
        },
      ],
    })) as { writeErrors?: unknown[] }
    if (result?.writeErrors?.length) {
      if (isDuplicateKey(result.writeErrors)) return false
      throw new Error(JSON.stringify(result.writeErrors))
    }
    return true
  } catch (error) {
    if (isDuplicateKey(error)) return false
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
 * Runs once (marker document in `migrations`). Returns the number of deleted
 * rows, or null when it was skipped because it already ran.
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

      const copies = brandRows
        .filter((row) => {
          const def = defaultByKey.get(`${row.flagId}:${row.environmentId}`)
          return (
            !!def &&
            row.targetingRules.length === 0 &&
            row.enabled === def.enabled &&
            row.defaultValue === def.defaultValue
          )
        })
        .map((row) => row.id)

      if (copies.length > 0) {
        const result = await prisma.flagEnvironment.deleteMany({
          where: { id: { in: copies }, brandId: { not: null } },
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
              completedAt: { $date: new Date().toISOString() },
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
