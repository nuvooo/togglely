import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { migrateBrandInheritance } from './brand-inherit.migration'
import { migrateEnvironmentSortOrder } from './environment-sort-order.migration'
import { migrateFlagWideRules } from './flag-wide-rules.migration'

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name)

  async onModuleInit() {
    await this.$connect()
    await this.normalizeLegacyDocuments()
    await this.runFlagWideRulesMigration()
    await this.runBrandInheritanceMigration()
    await this.runEnvironmentSortOrderMigration()
  }

  /** Every start, best-effort: never blocks boot. */
  private async runFlagWideRulesMigration() {
    try {
      await migrateFlagWideRules(this, this.logger)
    } catch (error) {
      this.logger.warn(
        `Flag-wide targeting rules migration skipped: ${String(error)}`
      )
    }
  }

  /** One-time, best-effort: never blocks boot. */
  private async runEnvironmentSortOrderMigration() {
    try {
      const updated = await migrateEnvironmentSortOrder(this, this.logger)
      if (updated === null) {
        this.logger.debug('Environment sort order backfill already applied')
      }
    } catch (error) {
      this.logger.warn(
        `Environment sort order backfill skipped: ${String(error)}`
      )
    }
  }

  /** One-time, best-effort: never blocks boot. */
  private async runBrandInheritanceMigration() {
    try {
      const deleted = await migrateBrandInheritance(this, this.logger)
      if (deleted === null) {
        this.logger.debug('Brand inheritance migration already applied')
      }
    } catch (error) {
      this.logger.warn(`Brand inheritance migration skipped: ${String(error)}`)
    }
  }

  /**
   * Older flag creation code stored FlagEnvironment documents without a
   * brandId field. Queries filter on `brandId: null`, which on MongoDB does
   * not match missing fields, so those flags were invisible to the SDK.
   * Idempotent: sets the field explicitly to null once. Also backfills
   * fields added to existing collections later.
   */
  private async normalizeLegacyDocuments() {
    try {
      // Environment.sortOrder was added later; Prisma cannot read a
      // document where the required Int is missing. Must run before any read.
      await this.$runCommandRaw({
        update: 'environments',
        updates: [
          {
            q: { sortOrder: { $exists: false } },
            u: { $set: { sortOrder: 0 } },
            multi: true,
          },
        ],
      })

      const result = (await this.$runCommandRaw({
        update: 'flag_environments',
        updates: [
          {
            q: { brandId: { $exists: false } },
            u: { $set: { brandId: null } },
            multi: true,
          },
        ],
      })) as { nModified?: number }
      if (result?.nModified) {
        this.logger.log(
          `Normalized brandId on ${result.nModified} flag environments`
        )
      }

      // TargetingRule.enabled was added later; missing means enabled
      await this.$runCommandRaw({
        update: 'targeting_rules',
        updates: [
          {
            q: { enabled: { $exists: false } },
            u: { $set: { enabled: true } },
            multi: true,
          },
          // Rule scope flags were added later; missing means "one of"
          {
            q: { environmentsExcluded: { $exists: false } },
            u: { $set: { environmentsExcluded: false } },
            multi: true,
          },
          {
            q: { brandsExcluded: { $exists: false } },
            u: { $set: { brandsExcluded: false } },
            multi: true,
          },
        ],
      })
    } catch (error) {
      this.logger.warn(
        `Legacy document normalization skipped: ${String(error)}`
      )
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
