import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'
import { isPrismaUniqueConstraintError } from '../../shared/prisma-errors'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { getDefaultFlagValue } from '../sdk/sdk.helpers'

/**
 * Brand values: a FlagEnvironment row with `brandId: null` is the environment
 * default. A brand without an own row inherits that default live; a row with
 * the brand's id is an override. Reads never create brand rows.
 */
@Injectable()
export class BrandsService {
  private readonly logger = new Logger(BrandsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async findByProject(projectId: string) {
    return this.prisma.brand.findMany({
      where: { projectId },
    })
  }

  async findFlagsForBrand(brandId: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
    })

    if (!brand) throw new NotFoundException('Brand not found')

    const flags = await this.prisma.featureFlag.findMany({
      where: { projectId: brand.projectId },
    })

    const environments = await this.prisma.environment.findMany({
      where: { projectId: brand.projectId },
    })

    const flagEnvs = await this.prisma.flagEnvironment.findMany({
      where: {
        flagId: { in: flags.map((f) => f.id) },
        OR: [{ brandId: null }, { brandId }],
      },
    })

    return {
      brand: { id: brand.id, name: brand.name, key: brand.key },
      flags: flags.map((f) => ({
        id: f.id,
        name: f.name,
        key: f.key,
        description: f.description,
        flagType: f.flagType,
        environments: environments.map((env) => {
          const defaultEnv = flagEnvs.find(
            (fe) =>
              fe.flagId === f.id &&
              fe.environmentId === env.id &&
              fe.brandId === null
          )
          const brandEnv = flagEnvs.find(
            (fe) =>
              fe.flagId === f.id &&
              fe.environmentId === env.id &&
              fe.brandId === brandId
          )

          const fallbackValue = getDefaultFlagValue(f.flagType)
          return {
            id: defaultEnv?.id || brandEnv?.id || '',
            environmentId: env.id,
            environmentName: env.name,
            enabled: brandEnv?.enabled ?? defaultEnv?.enabled ?? false,
            defaultValue:
              brandEnv?.defaultValue ??
              defaultEnv?.defaultValue ??
              fallbackValue,
            inherited: !brandEnv,
            isBrandSpecific: !!brandEnv,
            default: {
              enabled: defaultEnv?.enabled ?? false,
              defaultValue: defaultEnv?.defaultValue ?? fallbackValue,
            },
          }
        }),
      })),
    }
  }

  async create(
    projectId: string,
    data: { name: string; key: string; description?: string }
  ) {
    return this.prisma.brand.create({
      data: {
        name: data.name,
        key: data.key,
        description: data.description,
        projectId,
      },
    })
  }

  async update(brandId: string, data: { name?: string; description?: string }) {
    // Copy only whitelisted fields (never projectId/key from the request).
    const updateData: { name?: string; description?: string } = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) {
      updateData.description = data.description
    }
    return this.prisma.brand.update({
      where: { id: brandId },
      data: updateData,
    })
  }

  async delete(brandId: string) {
    // Delete all flag environments for this brand first (cascading delete for MongoDB)
    await this.prisma.flagEnvironment.deleteMany({ where: { brandId } })
    await this.prisma.brand.delete({ where: { id: brandId } })
  }

  /**
   * Sets the brand's `enabled` state. Creates the brand override when the
   * brand inherited so far (seeded from the environment default); without an
   * explicit `enabled` the effective state is inverted.
   */
  async toggleFlag(
    brandId: string,
    flagId: string,
    environmentId: string,
    enabled?: boolean,
    userId?: string
  ) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })

    if (!flag) throw new NotFoundException('Flag not found')

    const existing = await this.prisma.flagEnvironment.findFirst({
      where: { flagId, environmentId, brandId },
    })

    let result
    if (existing) {
      const newEnabled = enabled !== undefined ? enabled : !existing.enabled
      const updateData: Record<string, unknown> = { enabled: newEnabled }
      if (flag.flagType === 'BOOLEAN') {
        updateData.defaultValue = String(newEnabled)
      }

      result = await this.prisma.flagEnvironment.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      const defaultEnv = await this.prisma.flagEnvironment.findFirst({
        where: { flagId, environmentId, brandId: null },
      })
      const newEnabled = enabled ?? !(defaultEnv?.enabled ?? false)
      try {
        result = await this.prisma.flagEnvironment.create({
          data: {
            flagId,
            environmentId,
            brandId,
            enabled: newEnabled,
            defaultValue:
              flag.flagType === 'BOOLEAN'
                ? String(newEnabled)
                : (defaultEnv?.defaultValue ??
                  getDefaultFlagValue(flag.flagType)),
          },
        })
      } catch (e: unknown) {
        if (!isPrismaUniqueConstraintError(e)) throw e
        const found = await this.prisma.flagEnvironment.findFirst({
          where: { flagId, environmentId, brandId },
        })
        if (!found) throw e
        result = await this.prisma.flagEnvironment.update({
          where: { id: found.id },
          data: { enabled: newEnabled },
        })
      }
    }

    if (userId) {
      await this.auditLogs.create({
        action: 'flag.brand_toggled',
        entityType: 'FlagEnvironment',
        entityId: result.id,
        userId,
        organizationId: flag.organizationId,
        projectId: flag.projectId,
        oldValues: existing
          ? { enabled: existing.enabled, inherited: false }
          : { inherited: true },
        newValues: { brandId, environmentId, enabled: result.enabled },
      })
    }

    return result
  }

  /**
   * Removes the brand override so the brand inherits the environment default
   * again. Idempotent: a brand that already inherits is left as is.
   */
  async resetOverride(
    brandId: string,
    flagId: string,
    environmentId: string,
    userId?: string
  ) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })
    if (!flag) throw new NotFoundException('Flag not found')

    const existing = await this.prisma.flagEnvironment.findFirst({
      where: { flagId, environmentId, brandId },
    })
    if (!existing) {
      return { brandId, flagId, environmentId, inherited: true, deleted: false }
    }

    await this.prisma.$transaction(async (tx) => {
      const rules = await tx.targetingRule.findMany({
        where: { flagEnvId: existing.id },
        select: { id: true },
      })
      if (rules.length > 0) {
        await tx.ruleCondition.deleteMany({
          where: { ruleId: { in: rules.map((r) => r.id) } },
        })
        await tx.targetingRule.deleteMany({
          where: { flagEnvId: existing.id },
        })
      }
      await tx.flagEnvironment.delete({ where: { id: existing.id } })
    })

    if (userId) {
      await this.auditLogs.create({
        action: 'flag.brand_override_reset',
        entityType: 'FlagEnvironment',
        entityId: existing.id,
        userId,
        organizationId: flag.organizationId,
        projectId: flag.projectId,
        oldValues: {
          brandId,
          environmentId,
          enabled: existing.enabled,
          defaultValue: existing.defaultValue,
        },
        newValues: { brandId, environmentId, inherited: true },
      })
    }

    return { brandId, flagId, environmentId, inherited: true, deleted: true }
  }
}
