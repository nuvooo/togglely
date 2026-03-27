import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Flag } from '../../domain/flag.entity'
import type { PrismaService } from '../../shared/prisma.service'
import { isPrismaUniqueConstraintError } from '../../shared/prisma-errors'
import type { AuditLogsService } from '../audit-logs/audit-logs.service'
import { getDefaultFlagValue } from '../sdk/sdk.helpers'
import type { CreateFlagDto } from './dto/create-flag.dto'
import type { UpdateFlagValueDto } from './dto/update-flag-value.dto'

@Injectable()
export class FlagsService {
  private readonly logger = new Logger(FlagsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
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

    const where = projectId ? { projectId } : {}
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
      include: { environments: true },
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
      environments: f.flagEnvironments
        .filter((fe) => !fe.brandId) // Only return non-brand environments
        .map((fe) => ({
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
    })

    if (!f) throw new NotFoundException('Flag not found')

    return {
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      flagType: f.flagType,
      projectId: f.projectId,
    }
  }

  async create(projectId: string, userId: string, dto: CreateFlagDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: true },
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

    const { created, envsWithNames } = await this.prisma.$transaction(async (tx) => {
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
    })

    await this.auditLogs.create({
      action: 'flag.created',
      entityType: 'FeatureFlag',
      entityId: created.id,
      userId,
      organizationId: project.organizationId,
      projectId,
      newValues: { key: created.key, name: created.name, flagType: created.flagType },
    })

    return {
      featureFlag: {
        id: created.id,
        key: created.key,
        name: created.name,
        description: created.description,
        flagType: created.flagType,
        environments: envsWithNames.map((fe) => ({
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

    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description,
      type: updated.flagType,
      projectId: updated.projectId,
    }
  }

  async toggle(flagId: string, environmentId: string, enabled?: boolean) {
    // Find the flag to check its type
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })

    if (!flag) throw new NotFoundException('Flag not found')

    const allEnvs = await this.prisma.flagEnvironment.findMany({
      where: { flagId, environmentId },
    })

    const globalEnv = allEnvs.find((fe) => !fe.brandId)
    const newEnabled =
      enabled !== undefined ? enabled : !(globalEnv?.enabled ?? false)

    // Prepare update data - for BOOLEAN flags, sync defaultValue with enabled
    const updateData: any = { enabled: newEnabled }
    if (flag.flagType === 'BOOLEAN') {
      updateData.defaultValue = String(newEnabled)
    }

    if (allEnvs.length > 0) {
      // Update ALL records (global + all brands) so they stay in sync
      await this.prisma.flagEnvironment.updateMany({
        where: { flagId, environmentId },
        data: updateData,
      })
      return { flagId, environmentId, enabled: newEnabled }
    }

    // No records exist yet — create the global one
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
        const allEnvs2 = await this.prisma.flagEnvironment.findMany({
          where: { flagId, environmentId },
        })
        if (allEnvs2.length > 0) {
          await this.prisma.flagEnvironment.updateMany({
            where: { flagId, environmentId },
            data: updateData,
          })
          return { flagId, environmentId, enabled: newEnabled }
        }
      }
      throw e
    }
  }

  async getEnvironments(flagId: string) {
    const envs = await this.prisma.flagEnvironment.findMany({
      where: { flagId, brandId: null },
      include: { environment: true },
    })

    return envs.map((fe) => ({
      id: fe.environment.id,
      name: fe.environment.name,
      enabled: fe.enabled,
      defaultValue: fe.defaultValue,
    }))
  }

  async updateEnvironment(
    flagId: string,
    envId: string,
    data: { isEnabled?: boolean; defaultValue?: string }
  ) {
    this.logger.debug(`[updateEnvironment] flagId=${flagId}, envId=${envId}`)

    // Find the flag to check its type
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })

    if (!flag) throw new NotFoundException('Flag not found')

    // Try 1: Find by flagEnvironment.id directly (most likely case)
    let existing = await this.prisma.flagEnvironment.findFirst({
      where: { id: envId },
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
      existing = allEnvs.find(
        (fe) => fe.id === envId || fe.environmentId === envId
      )
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

      return this.prisma.flagEnvironment.update({
        where: { id: existing.id },
        data: updateData,
      })
    }

    this.logger.warn(
      `[updateEnvironment] flag environment not found for flagId=${flagId}, envId=${envId}`
    )
    throw new NotFoundException('Flag environment not found')
  }

  async updateValue(
    flagId: string,
    environmentId: string,
    dto: UpdateFlagValueDto
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

    if (existing) {
      return this.prisma.flagEnvironment.update({
        where: { id: existing.id },
        data: {
          enabled: enabled,
          defaultValue: defaultValue,
        },
      })
    }

    return this.prisma.flagEnvironment.create({
      data: {
        flagId,
        environmentId,
        brandId,
        enabled: enabled ?? false,
        defaultValue: defaultValue ?? getDefaultFlagValue(flag.flagType),
      },
    })
  }

  async delete(flagId: string, userId?: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })

    await this.prisma.$transaction(async (tx) => {
      await tx.flagEnvironment.deleteMany({ where: { flagId } })
      await tx.featureFlag.delete({ where: { id: flagId } })
    })

    if (flag && userId) {
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
