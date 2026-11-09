import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { FlagEnvironment } from '@prisma/client'
import { PrismaService } from '../../shared/prisma.service'
import { isPrismaUniqueConstraintError } from '../../shared/prisma-errors'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { writeAudit } from '../audit-logs/write-audit'
import { ChangeEventsService } from '../change-events/change-events.service'
import { ChangeAction } from '../change-events/change-events.types'
import { ENVIRONMENT_ORDER_BY } from '../environments/environment-order'
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
    private readonly auditLogs: AuditLogsService,
    private readonly changes: ChangeEventsService
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
      orderBy: ENVIRONMENT_ORDER_BY,
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
    const brand = await this.prisma.brand.create({
      data: {
        name: data.name,
        key: data.key,
        description: data.description,
        projectId,
      },
    })
    await this.recordBrandChanged(projectId)
    return brand
  }

  async update(brandId: string, data: { name?: string; description?: string }) {
    // Copy only whitelisted fields (never projectId/key from the request).
    const updateData: { name?: string; description?: string } = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) {
      updateData.description = data.description
    }
    const brand = await this.prisma.brand.update({
      where: { id: brandId },
      data: updateData,
    })
    await this.recordBrandChanged(brand.projectId)
    return brand
  }

  async delete(brandId: string) {
    // Delete all flag environments for this brand first (cascading delete for MongoDB)
    await this.prisma.flagEnvironment.deleteMany({ where: { brandId } })
    const brand = await this.prisma.brand.delete({ where: { id: brandId } })
    await this.recordBrandChanged(brand.projectId)
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

    let result: FlagEnvironment
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

    this.recordFlagChanged(flag, environmentId, 'toggled')

    if (userId) {
      await writeAudit(this.auditLogs, this.logger, {
        action: 'flag.brand_toggled',
        entityType: 'FlagEnvironment',
        entityId: result.id,
        userId,
        organizationId: flag.organizationId,
        projectId: flag.projectId,
        oldValues: existing
          ? {
              flagId,
              flagKey: flag.key,
              enabled: existing.enabled,
              inherited: false,
            }
          : { flagId, flagKey: flag.key, inherited: true },
        newValues: {
          flagId,
          flagKey: flag.key,
          brandId,
          environmentId,
          enabled: result.enabled,
        },
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
    this.recordFlagChanged(flag, environmentId, 'updated')

    if (userId) {
      await writeAudit(this.auditLogs, this.logger, {
        action: 'flag.brand_override_reset',
        entityType: 'FlagEnvironment',
        entityId: existing.id,
        userId,
        organizationId: flag.organizationId,
        projectId: flag.projectId,
        oldValues: {
          flagId,
          flagKey: flag.key,
          brandId,
          environmentId,
          enabled: existing.enabled,
          defaultValue: existing.defaultValue,
        },
        newValues: {
          flagId,
          flagKey: flag.key,
          brandId,
          environmentId,
          inherited: true,
        },
      })
    }

    return { brandId, flagId, environmentId, inherited: true, deleted: true }
  }

  private recordFlagChanged(
    flag: { key: string; projectId: string; organizationId: string },
    environmentId: string,
    action: ChangeAction
  ) {
    void this.changes.recordChange({
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      environmentIds: [environmentId],
      changes: [{ flagKey: flag.key, action }],
    })
  }

  /**
   * Brands are evaluated in every environment. Brand has no organizationId,
   * so it is looked up here; failures never fail the brand mutation.
   */
  private async recordBrandChanged(projectId: string) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { organizationId: true },
      })
      if (!project) return
      void this.changes.recordChange({
        organizationId: project.organizationId,
        projectId,
        environmentIds: 'all',
        changes: [{ action: 'brand_changed' }],
      })
    } catch (error) {
      this.logger.error(
        `Failed to record brand change for project ${projectId}: ${String(error)}`
      )
    }
  }
}
