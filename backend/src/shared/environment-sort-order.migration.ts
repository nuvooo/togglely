import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import {
  claimMigrationMarker,
  completeMigrationMarker,
  releaseMigrationMarker,
} from './migration-marker'

export const ENVIRONMENT_SORT_ORDER_MIGRATION_ID = 'environment-sort-order-v1'

type MigrationClient = Pick<PrismaClient, '$runCommandRaw' | 'environment'>

/**
 * Environments had no persisted order (every row has sortOrder 0, set by the
 * legacy normalization in PrismaService). Number each project's environments
 * by creation time so the existing order (development, production, ...) is
 * kept once ordering by sortOrder.
 *
 * Projects that already have a non-zero sortOrder were ordered by a user and
 * are left alone. Each update only applies while the row still has
 * sortOrder 0, so a concurrent reorder wins. Runs once (marker
 * `environment-sort-order-v1` in `migrations`). Returns the number of updated
 * rows, or null when skipped.
 */
export async function migrateEnvironmentSortOrder(
  prisma: MigrationClient,
  logger: Pick<Logger, 'log'> = new Logger('EnvironmentSortOrderMigration')
): Promise<number | null> {
  if (
    !(await claimMigrationMarker(prisma, ENVIRONMENT_SORT_ORDER_MIGRATION_ID))
  ) {
    return null
  }

  try {
    const envs = await prisma.environment.findMany({
      select: { id: true, projectId: true, sortOrder: true },
      orderBy: [{ projectId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    })

    const byProject = new Map<string, typeof envs>()
    for (const env of envs) {
      const list = byProject.get(env.projectId) ?? []
      list.push(env)
      byProject.set(env.projectId, list)
    }

    let updated = 0
    for (const list of byProject.values()) {
      if (list.some((env) => env.sortOrder !== 0)) continue
      for (let index = 1; index < list.length; index++) {
        const result = await prisma.environment.updateMany({
          where: { id: list[index].id, sortOrder: 0 },
          data: { sortOrder: index },
        })
        updated += result.count
      }
    }

    await completeMigrationMarker(prisma, ENVIRONMENT_SORT_ORDER_MIGRATION_ID, {
      updated,
    })
    logger.log(`Environment sort order backfill: numbered ${updated} rows`)
    return updated
  } catch (error) {
    await releaseMigrationMarker(prisma, ENVIRONMENT_SORT_ORDER_MIGRATION_ID)
    throw error
  }
}
