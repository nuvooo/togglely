import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { FlagType } from '@prisma/client'
import { Flag } from '../../domain/flag.entity'
import { PrismaService } from '../../shared/prisma.service'
import { isPrismaUniqueConstraintError } from '../../shared/prisma-errors'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { ChangeEventsService } from '../change-events/change-events.service'
import {
  ENVIRONMENT_ORDER_BY,
  sortByEnvironmentOrder,
  sortByEnvironmentPosition,
} from '../environments/environment-order'
import { getDefaultFlagValue } from '../sdk/sdk.helpers'
import { CreateFlagDto } from './dto/create-flag.dto'
import { UpdateFlagValueDto } from './dto/update-flag-value.dto'
import { latestFlagUpdate } from './flag-timestamps'

@Injectable()
export class FlagsService {
  private readonly logger = new Logger(FlagsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly changes: ChangeEventsService
  ) {}

  async findAll(userId: string, projectId?: string, environmentId?: string) {
    if (projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      })
      if (!project) throw new NotFoundException('Project not found')

      const membership = await this.prisma.organizationMember.findFirst({
        where: { userId, organizationId: project.organizationId },
      })
      if (!membership) throw new ForbiddenException('Access denied')
    }

    let where: { projectId: string } | { organizationId: { in: string[] } }
    if (projectId) {
      where = { projectId }
    } else {
      // Never list flags across tenants: restrict to the user's organizations.
      const memberships = await this.prisma.organizationMember.findMany({
        where: { userId },
        select: { organizationId: true },
      })
      const organizationIds = memberships.map((m) => m.organizationId)
      if (organizationIds.length === 0) return []
      where = { organizationId: { in: organizationIds } }
    }
    const flags = await this.prisma.featureFlag.findMany({ where })

    // If environmentId is provided, get the actual enabled status
    const flagEnvs: Map<
      string,
      { enabled: boolean; defaultValue: string; environmentId: string }
    > = new Map()
    if (projectId && environmentId) {
      const envs = await this.prisma.flagEnvironment.findMany({
        where: {
          flagId: { in: flags.map((f) => f.id) },
          environmentId,
          brandId: null,
        },
      })
      envs.forEach((fe) => {
        flagEnvs.set(fe.flagId, {
          enabled: fe.enabled,
          defaultValue: fe.defaultValue,
          environmentId: fe.environmentId,
        })
      })
    }

    return flags.map((f) => {
      const flagEnv = flagEnvs.get(f.id)
      return {
        id: f.id,
        key: f.key,
        name: f.name,
        description: f.description,
        flagType: f.flagType,
        projectId: f.projectId,
        enabled: flagEnv?.enabled ?? false,
        defaultValue: flagEnv?.defaultValue,
        environmentId: flagEnv?.environmentId,
      }
    })
  }

  async findByProject(projectId: string) {
    // Get project environments first
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: { orderBy: ENVIRONMENT_ORDER_BY } },
    })

    if (!project) throw new NotFoundException('Project not found')

    const flags = await this.prisma.featureFlag.findMany({
      where: { projectId },
      include: {
        flagEnvironments: {
          include: { environment: true },
        },
      },
    })

    // Ensure all flags have environments (only non-brand ones)
    for (const flag of flags) {
      const existingEnvIds = new Set(
        flag.flagEnvironments
          .filter((fe) => !fe.brandId) // Only non-brand environments
          .map((fe) => fe.environmentId)
      )

      const missingEnvs = project.environments.filter(
        (env) => !existingEnvIds.has(env.id)
      )

      for (const env of missingEnvs) {
        try {
          await this.prisma.flagEnvironment.create({
            data: {
              flagId: flag.id,
              environmentId: env.id,
              brandId: null,
              enabled: false,
              defaultValue: getDefaultFlagValue(flag.flagType),
            },
          })
        } catch (error) {
          if (!isPrismaUniqueConstraintError(error)) throw error
        }
      }
    }

    // Reload flags with created environments
    const flagsWithEnvs = await this.prisma.featureFlag.findMany({
      where: { projectId },
      include: {
        flagEnvironments: {
          include: { environment: true },
        },
      },
    })

    return flagsWithEnvs.map((f) => ({
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      flagType: f.flagType,
      projectId: f.projectId,
      createdAt: f.createdAt,
      updatedAt: latestFlagUpdate(f),
      environments: sortByEnvironmentPosition(
        f.flagEnvironments.filter((fe) => !fe.brandId), // non-brand only
        project.environments
      ).map((fe) => ({
        id: fe.id,
        environmentId: fe.environmentId,
        environmentName: fe.environment.name,
        enabled: fe.enabled,
        defaultValue: fe.defaultValue,
      })),
    }))
  }

  async findOne(flagId: string) {
    const f = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
      include: { flagEnvironments: { select: { updatedAt: true } } },
    })

    if (!f) throw new NotFoundException('Flag not found')

    return {
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      flagType: f.flagType,
      projectId: f.projectId,
      createdAt: f.createdAt,
      updatedAt: latestFlagUpdate(f),
    }
  }

  async create(projectId: string, userId: string, dto: CreateFlagDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: { orderBy: ENVIRONMENT_ORDER_BY } },
    })

    if (!project) throw new NotFoundException('Project not found')

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: project.organizationId },
    })
    if (!membership) throw new ForbiddenException('Access denied')

    const normalizedKey = dto.key.trim().toLowerCase()

    const existing = await this.prisma.featureFlag.findFirst({
      where: { projectId, key: normalizedKey },
    })

    if (existing) {
      throw new ConflictException(
        `Flag with key '${normalizedKey}' already exists`
      )
    }

    const flag = Flag.create({
      key: normalizedKey,
      name: dto.name,
      description: dto.description || null,
      type: dto.type,
      projectId,
      organizationId: project.organizationId,
      createdById: userId,
    })

    const { created, envsWithNames } = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.featureFlag.create({
          data: {
            id: flag.id,
            key: flag.key,
            name: flag.name,
            description: flag.description,
            flagType: flag.type,
            projectId: flag.projectId,
            organizationId: flag.organizationId,
            createdById: userId,
          },
        })

        await Promise.all(
          project.environments.map((env) =>
            tx.flagEnvironment.create({
              data: {
                flagId: created.id,
                environmentId: env.id,
                // Must be explicit: on MongoDB a `brandId: null` filter does
                // not match documents where the field is missing.
                brandId: null,
                enabled: dto.initialValues?.[env.key]?.enabled ?? false,
                defaultValue: dto.initialValues?.[env.key]?.value ?? 'false',
              },
            })
          )
        )

        // Get environments with names for the response
        const envsWithNames = await tx.flagEnvironment.findMany({
          where: { flagId: created.id, brandId: null },
          include: { environment: true },
        })

        return { created, envsWithNames }
      }
    )

    void this.changes.recordChange({
      organizationId: project.organizationId,
      projectId,
      environmentIds: 'all',
      changes: [{ flagKey: created.key, action: 'created' }],
    })

    await this.auditLogs.create({
      action: 'flag.created',
      entityType: 'FeatureFlag',
      entityId: created.id,
      userId,
      organizationId: project.organizationId,
      projectId,
      newValues: {
        key: created.key,
        name: created.name,
        flagType: created.flagType,
      },
    })

    return {
      featureFlag: {
        id: created.id,
        key: created.key,
        name: created.name,
        description: created.description,
        flagType: created.flagType,
        environments: sortByEnvironmentPosition(
          envsWithNames,
          project.environments
        ).map((fe) => ({
          id: fe.id,
          environmentId: fe.environmentId,
          environmentName: fe.environment.name,
          enabled: fe.enabled,
          defaultValue: fe.defaultValue,
        })),
      },
    }
  }

  async update(flagId: string, data: { name?: string; description?: string }) {
    const updated = await this.prisma.featureFlag.update({
      where: { id: flagId },
      data,
    })

    void this.changes.recordChange({
      organizationId: updated.organizationId,
      projectId: updated.projectId,
      environmentIds: 'all',
      changes: [{ flagKey: updated.key, action: 'updated' }],
    })

    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description,
      type: updated.flagType,
      projectId: updated.projectId,
    }
  }

  async toggle(
    flagId: string,
    environmentId: string,
    enabled?: boolean,
    userId?: string
  ) {
    // Find the flag to check its type
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })

    if (!flag) throw new NotFoundException('Flag not found')

    // Only the environment default (brandId null) is toggled. Brands without
    // an own row inherit it live; brand overrides stay untouched.
    const globalEnv = await this.prisma.flagEnvironment.findFirst({
      where: { flagId, environmentId, brandId: null },
    })
    const newEnabled =
      enabled !== undefined ? enabled : !(globalEnv?.enabled ?? false)

    // Prepare update data - for BOOLEAN flags, sync defaultValue with enabled
    const updateData: { enabled: boolean; defaultValue?: string } = {
      enabled: newEnabled,
    }
    if (flag.flagType === 'BOOLEAN') {
      updateData.defaultValue = String(newEnabled)
    }

    const result = await this.writeToggle(
      flag,
      environmentId,
      globalEnv?.id ?? null,
      updateData
    )

    void this.changes.recordChange({
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      environmentIds: [environmentId],
      changes: [{ flagKey: flag.key, action: 'toggled' }],
    })

    await this.auditFlag(
      'flag.toggled',
      flag,
      userId,
      { environmentId, enabled: globalEnv?.enabled ?? false },
      { environmentId, enabled: newEnabled }
    )

    return result
  }

  /**
   * Audit entry of a change to one flag (entity = the flag), so the flag's
   * history can be queried by entityId. Skipped without an acting user.
   */
  private async auditFlag(
    action: string,
    flag: {
      id: string
      key: string
      organizationId: string
      projectId: string
    },
    userId: string | undefined,
    oldValues: Record<string, unknown> | undefined,
    newValues: Record<string, unknown>
  ) {
    if (!userId) return
    const ref = { flagId: flag.id, flagKey: flag.key }
    await this.auditLogs.create({
      action,
      entityType: 'FeatureFlag',
      entityId: flag.id,
      userId,
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      oldValues: oldValues ? { ...ref, ...oldValues } : undefined,
      newValues: { ...ref, ...newValues },
    })
  }

  private async writeToggle(
    flag: { id: string; flagType: FlagType },
    environmentId: string,
    globalEnvId: string | null,
    updateData: { enabled: boolean; defaultValue?: string }
  ) {
    const flagId = flag.id
    const newEnabled = updateData.enabled

    if (globalEnvId) {
      await this.prisma.flagEnvironment.update({
        where: { id: globalEnvId },
        data: updateData,
      })
      return { flagId, environmentId, enabled: newEnabled }
    }

    // No default exists yet — create it
    try {
      return await this.prisma.flagEnvironment.create({
        data: {
          flagId,
          environmentId,
          brandId: null,
          enabled: newEnabled,
          defaultValue:
            flag.flagType === 'BOOLEAN'
              ? String(newEnabled)
              : getDefaultFlagValue(flag.flagType),
        },
      })
    } catch (e: any) {
      if (e.code === 'P2002') {
        await this.prisma.flagEnvironment.updateMany({
          where: { flagId, environmentId, brandId: null },
          data: updateData,
        })
        return { flagId, environmentId, enabled: newEnabled }
      }
      throw e
    }
  }

  async getEnvironments(flagId: string) {
    const envs = await this.prisma.flagEnvironment.findMany({
      where: { flagId, brandId: null },
      include: { environment: true },
    })

    return sortByEnvironmentOrder(envs).map((fe) => ({
      id: fe.environment.id,
      name: fe.environment.name,
      enabled: fe.enabled,
      defaultValue: fe.defaultValue,
    }))
  }

  async updateEnvironment(
    flagId: string,
    envId: string,
    data: { isEnabled?: boolean; defaultValue?: string },
    userId?: string
  ) {
    this.logger.debug(`[updateEnvironment] flagId=${flagId}, envId=${envId}`)

    // Find the flag to check its type
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })

    if (!flag) throw new NotFoundException('Flag not found')

    // Try 1: Find by flagEnvironment.id directly (most likely case).
    // Always scoped to flagId so a FlagEnvironment of another flag/tenant can
    // never be modified through this flag's route.
    let existing = await this.prisma.flagEnvironment.findFirst({
      where: { id: envId, flagId },
    })
    this.logger.debug(
      `[updateEnvironment] direct lookup result: ${existing ? 'found' : 'not found'}`
    )

    // Try 2: Find by flagId + environmentId (for non-brand envs)
    if (!existing) {
      existing = await this.prisma.flagEnvironment.findFirst({
        where: { flagId, environmentId: envId, brandId: null },
      })
      this.logger.debug(
        `[updateEnvironment] fallback lookup result: ${existing ? 'found' : 'not found'}`
      )
    }

    // Try 3: Find any flagEnv for this flag in this environment (regardless of brand)
    if (!existing) {
      const allEnvs = await this.prisma.flagEnvironment.findMany({
        where: { flagId },
        include: { environment: true },
      })
      this.logger.debug(
        `[updateEnvironment] scanning ${allEnvs.length} candidate environments`
      )

      // Find one matching the envId (either by environment.id or flagEnvironment.id)
      existing =
        allEnvs.find((fe) => fe.id === envId || fe.environmentId === envId) ??
        null
    }

    if (existing) {
      this.logger.debug(
        `[updateEnvironment] updating flagEnvironment ${existing.id}`
      )

      // For BOOLEAN flags, sync enabled and defaultValue
      const updateData: any = {
        enabled: data.isEnabled,
        defaultValue: data.defaultValue,
      }

      if (flag.flagType === 'BOOLEAN') {
        if (data.isEnabled !== undefined && data.defaultValue === undefined) {
          // Only enabled changed, sync defaultValue
          updateData.defaultValue = String(data.isEnabled)
        } else if (
          data.defaultValue !== undefined &&
          data.isEnabled === undefined
        ) {
          // Only value changed, sync enabled
          updateData.enabled = data.defaultValue === 'true'
        }
      }

      const updated = await this.prisma.flagEnvironment.update({
        where: { id: existing.id },
        data: updateData,
      })
      void this.changes.recordChange({
        organizationId: flag.organizationId,
        projectId: flag.projectId,
        environmentIds: [existing.environmentId],
        changes: [{ flagKey: flag.key, action: 'updated' }],
      })
      if (userId) {
        await this.auditFlag(
          'flag.environment_updated',
          flag,
          userId,
          {
            environmentId: existing.environmentId,
            brandId: existing.brandId,
            enabled: existing.enabled,
            defaultValue: existing.defaultValue,
          },
          {
            environmentId: updated.environmentId,
            brandId: updated.brandId,
            enabled: updated.enabled,
            defaultValue: updated.defaultValue,
          }
        )
      }
      return updated
    }

    this.logger.warn(
      `[updateEnvironment] flag environment not found for flagId=${flagId}, envId=${envId}`
    )
    throw new NotFoundException('Flag environment not found')
  }

  async updateValue(
    flagId: string,
    environmentId: string,
    dto: UpdateFlagValueDto,
    userId?: string
  ) {
    const brandId = dto.brandId || null

    // Find the flag to check its type
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })

    if (!flag) throw new NotFoundException('Flag not found')

    const existing = await this.prisma.flagEnvironment.findFirst({
      where: { flagId, environmentId, brandId },
    })

    // For BOOLEAN flags, sync enabled and value
    let enabled = dto.enabled
    let defaultValue = dto.value

    if (flag.flagType === 'BOOLEAN') {
      if (dto.enabled !== undefined && dto.value === undefined) {
        // Only enabled provided, sync value
        defaultValue = String(dto.enabled)
      } else if (dto.value !== undefined && dto.enabled === undefined) {
        // Only value provided, sync enabled
        enabled = dto.value === 'true'
      }
    }

    const recordValueChange = () =>
      void this.changes.recordChange({
        organizationId: flag.organizationId,
        projectId: flag.projectId,
        environmentIds: [environmentId],
        changes: [{ flagKey: flag.key, action: 'updated' }],
      })

    const auditValueChange = async (
      oldValues: Record<string, unknown>,
      row: { enabled: boolean; defaultValue: string }
    ) => {
      if (!userId) return
      await this.auditFlag(
        'flag.value_updated',
        flag,
        userId,
        { environmentId, ...(brandId ? { brandId } : {}), ...oldValues },
        {
          environmentId,
          ...(brandId ? { brandId } : {}),
          enabled: row.enabled,
          defaultValue: row.defaultValue,
        }
      )
    }

    if (existing) {
      const updated = await this.prisma.flagEnvironment.update({
        where: { id: existing.id },
        data: {
          enabled: enabled,
          defaultValue: defaultValue,
        },
      })
      recordValueChange()
      await auditValueChange(
        { enabled: existing.enabled, defaultValue: existing.defaultValue },
        updated
      )
      return updated
    }

    // A new brand row is an override: fields not given are taken from the
    // environment default the brand inherited so far.
    const inheritedFrom = brandId
      ? await this.prisma.flagEnvironment.findFirst({
          where: { flagId, environmentId, brandId: null },
        })
      : null

    const created = await this.prisma.flagEnvironment.create({
      data: {
        flagId,
        environmentId,
        brandId,
        enabled: enabled ?? inheritedFrom?.enabled ?? false,
        defaultValue:
          defaultValue ??
          inheritedFrom?.defaultValue ??
          getDefaultFlagValue(flag.flagType),
      },
    })
    recordValueChange()
    await auditValueChange(
      brandId
        ? { inherited: true }
        : // A missing environment default: nothing to compare with
          {},
      created
    )
    return created
  }

  async delete(flagId: string, userId?: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })
    if (!flag) throw new NotFoundException('Flag not found')

    await this.prisma.$transaction(async (tx) => {
      await tx.flagEnvironment.deleteMany({ where: { flagId } })
      await tx.featureFlag.delete({ where: { id: flagId } })
    })

    void this.changes.recordChange({
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      environmentIds: 'all',
      changes: [{ flagKey: flag.key, action: 'deleted' }],
    })

    if (userId) {
      await this.auditLogs.create({
        action: 'flag.deleted',
        entityType: 'FeatureFlag',
        entityId: flagId,
        userId,
        organizationId: flag.organizationId,
        projectId: flag.projectId,
        oldValues: { key: flag.key, name: flag.name },
      })
    }
  }
}
