import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name)

  async onModuleInit() {
    await this.$connect()
    await this.normalizeFlagEnvironmentBrandIds()
  }

  /**
   * Older flag creation code stored FlagEnvironment documents without a
   * brandId field. Queries filter on `brandId: null`, which on MongoDB does
   * not match missing fields, so those flags were invisible to the SDK.
   * Idempotent: sets the field explicitly to null once.
   */
  private async normalizeFlagEnvironmentBrandIds() {
    try {
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
    } catch (error) {
      this.logger.warn(`brandId normalization skipped: ${String(error)}`)
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
