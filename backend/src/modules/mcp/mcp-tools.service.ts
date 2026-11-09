import { HttpException, Injectable } from '@nestjs/common'
import { OrganizationRole } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { hasRole } from '../../shared/access/access.service'
import { PrismaService } from '../../shared/prisma.service'
import { isPrismaUniqueConstraintError } from '../../shared/prisma-errors'
import { ENVIRONMENT_ORDER_BY } from '../environments/environment-order'
import { CreateFlagDto } from '../flags/dto/create-flag.dto'
import { UpdateFlagDto } from '../flags/dto/update-flag.dto'
import { UpdateFlagValueDto } from '../flags/dto/update-flag-value.dto'
import { FlagsService } from '../flags/flags.service'
import { getDefaultFlagValue } from '../sdk/sdk.helpers'
import {
  collectFlagStates,
  describeDeleteBlockers,
  FlagStateRow,
  findDivergentStates,
} from './flag-state'
import { McpContext } from './mcp-key.resolver'

export class McpToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpToolError'
  }
}

interface FlagView {
  key: string
  name: string
  description: string | null
  type: string
  states: FlagStateRow[]
}

@Injectable()
export class McpToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FlagsService
  ) {}

  async getProject(ctx: McpContext) {
    this.requireRole(ctx, 'VIEWER')
    const project = await this.prisma.project.findUnique({
      where: { id: ctx.projectId },
    })
    if (!project) throw new McpToolError('Project not found')
    const environments = await this.loadEnvironments(ctx)
    const brands = await this.loadBrands(ctx)
    return {
      project: { key: project.key, name: project.name, type: project.type },
      environments: environments.map((e) => ({
        key: e.key,
        name: e.name,
        canToggle: ctx.allowedEnvironmentIds.includes(e.id),
      })),
      brands: brands.map((b) => ({ key: b.key, name: b.name })),
    }
  }

  async listFlags(ctx: McpContext, input: { search?: string }) {
    this.requireRole(ctx, 'VIEWER')
    const search = input?.search?.trim()
    const flags = await this.prisma.featureFlag.findMany({
      where: {
        projectId: ctx.projectId,
        ...(search
          ? {
              OR: [
                { key: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { flagEnvironments: true },
      orderBy: { key: 'asc' },
    })
    const environments = await this.loadEnvironments(ctx)
    const brands = await this.loadBrands(ctx)
    return {
      flags: flags.map((f) => this.toView(f, environments, brands)),
    }
  }

  async getFlag(ctx: McpContext, input: { flagKey: string }) {
    this.requireRole(ctx, 'VIEWER')
    const flag = await this.findFlag(ctx, input?.flagKey)
    const environments = await this.loadEnvironments(ctx)
    const brands = await this.loadBrands(ctx)
    return this.toView(flag, environments, brands)
  }

  async createFlag(
    ctx: McpContext,
    input: {
      key: string
      name: string
      description?: string
      type: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'
    }
  ) {
    this.requireRole(ctx, 'MEMBER')
    const extra = Object.keys(input ?? {}).filter(
      (k) => !['key', 'name', 'description', 'type'].includes(k)
    )
    if (extra.length > 0) {
      throw new McpToolError(`Unsupported field(s): ${extra.join(', ')}`)
    }
    const { key, name, description, type } = input
    const dto = await this.validateInput(CreateFlagDto, {
      key,
      name,
      description,
      type,
    })
    // Every environment starts disabled with the type's default value. The
    // value is identical everywhere, so no environment is treated specially.
    const environments = await this.loadEnvironments(ctx)
    dto.initialValues = Object.fromEntries(
      environments.map((e) => [
        e.key,
        { enabled: false, value: getDefaultFlagValue(dto.type) },
      ])
    )
    const created = await this.run(() =>
      this.flags.create(ctx.projectId, ctx.userId, dto)
    )
    return { key: created?.featureFlag?.key ?? dto.key }
  }

  async updateFlag(
    ctx: McpContext,
    input: { flagKey: string; name?: string; description?: string }
  ) {
    this.requireRole(ctx, 'MEMBER')
    const { flagKey, ...rest } = input ?? ({} as typeof input)
    const dto = await this.validateInput(UpdateFlagDto, rest)
    const flag = await this.findFlag(ctx, flagKey)
    await this.run(() => this.flags.update(flag.id, dto, ctx.userId))
    return { key: flag.key }
  }

  async setFlagState(
    ctx: McpContext,
    input: {
      flagKey: string
      environmentKey: string
      enabled?: boolean
      value?: string
    }
  ) {
    this.requireRole(ctx, 'MEMBER')
    const { flagKey, environmentKey, ...rest } = input ?? ({} as typeof input)
    const dto = await this.validateInput(UpdateFlagValueDto, rest, {
      allowBrandId: false,
    })
    if (dto.enabled === undefined && dto.value === undefined) {
      throw new McpToolError('Provide "enabled" and/or "value"')
    }
    const flag = await this.findFlag(ctx, flagKey)
    const environments = await this.loadEnvironments(ctx)
    const env = environments.find((e) => e.key === environmentKey)
    if (!env) {
      throw new McpToolError(
        `Environment "${environmentKey}" not found in this project`
      )
    }
    if (!ctx.allowedEnvironmentIds.includes(env.id)) {
      const allowed = environments
        .filter((e) => ctx.allowedEnvironmentIds.includes(e.id))
        .map((e) => e.key)
        .join(', ')
      throw new McpToolError(
        `This key may not change environment "${env.key}". Allowed: ${allowed || '(none)'}`
      )
    }
    const updated = await this.run(() =>
      this.flags.updateValue(flag.id, env.id, dto, ctx.userId)
    )
    return {
      environmentKey: env.key,
      enabled: updated?.enabled ?? dto.enabled ?? false,
      value: updated?.defaultValue ?? dto.value ?? '',
    }
  }

  async deleteFlag(
    ctx: McpContext,
    input: { flagKey: string; confirm: boolean }
  ) {
    this.requireRole(ctx, 'MEMBER')
    const flag = await this.findFlag(ctx, input?.flagKey)
    const environments = await this.loadEnvironments(ctx)
    const brands = await this.loadBrands(ctx)
    const states = collectFlagStates(flag, environments, brands)
    const divergent = findDivergentStates(states)
    const [enabledRules, openExperiments] = await Promise.all([
      this.prisma.targetingRule.findMany({
        where: {
          flagEnvId: { in: flag.flagEnvironments.map((fe) => fe.id) },
          enabled: true,
        },
        select: { flagEnvId: true },
      }),
      this.prisma.experiment.findMany({
        where: {
          flagId: flag.id,
          status: { notIn: ['COMPLETED', 'ARCHIVED'] },
        },
        select: { key: true, status: true },
      }),
    ])
    const blockers = describeDeleteBlockers(
      flag.flagEnvironments,
      enabledRules,
      openExperiments,
      environments,
      brands
    )
    const canDelete = divergent.length === 0 && blockers.length === 0

    if (input.confirm !== true) {
      return { deleted: false, canDelete, states, divergent, blockers }
    }
    if (divergent.length > 0) {
      const list = divergent
        .map((r) =>
          r.brandKey ? `${r.environmentKey}/${r.brandKey}` : r.environmentKey
        )
        .join(', ')
      throw new McpToolError(
        `Flag "${flag.key}" is not in a uniform state; it differs in: ${list}. Align these states before deleting.`
      )
    }
    if (blockers.length > 0) {
      throw new McpToolError(
        `Flag "${flag.key}" cannot be deleted yet: ${blockers.join('; ')}.`
      )
    }
    await this.run(() => this.flags.delete(flag.id, ctx.userId))
    return { deleted: true, canDelete: true, states, divergent, blockers }
  }

  private requireRole(ctx: McpContext, min: OrganizationRole) {
    if (!hasRole(ctx.role, min)) {
      throw new McpToolError('Your role does not allow this action')
    }
  }

  private async findFlag(ctx: McpContext, flagKey: string) {
    // Same normalisation as FlagsService.create, so "New-Checkout" finds
    // the stored "new-checkout".
    const key = typeof flagKey === 'string' ? flagKey.trim().toLowerCase() : ''
    const flag = key
      ? await this.prisma.featureFlag.findFirst({
          where: { projectId: ctx.projectId, key },
          include: { flagEnvironments: true },
        })
      : null
    if (!flag) {
      throw new McpToolError(`Flag "${flagKey}" not found in this project`)
    }
    return flag
  }

  private loadEnvironments(ctx: McpContext) {
    return this.prisma.environment.findMany({
      where: { projectId: ctx.projectId },
      orderBy: ENVIRONMENT_ORDER_BY,
    })
  }

  private loadBrands(ctx: McpContext) {
    return this.prisma.brand.findMany({ where: { projectId: ctx.projectId } })
  }

  private toView(
    flag: {
      key: string
      name: string
      description: string | null
      flagType: FlagView['type']
      flagEnvironments: {
        environmentId: string
        brandId: string | null
        enabled: boolean
        defaultValue: string
      }[]
    },
    environments: { id: string; key: string }[],
    brands: { id: string; key: string }[]
  ): FlagView {
    return {
      key: flag.key,
      name: flag.name,
      description: flag.description,
      type: flag.flagType,
      states: collectFlagStates(flag as never, environments, brands),
    }
  }

  private async validateInput<T extends object>(
    cls: new () => T,
    input: unknown,
    opts: { allowBrandId?: boolean } = {}
  ): Promise<T> {
    const instance = plainToInstance(cls, input ?? {})
    const errors = await validate(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
    if (errors.length > 0) {
      throw new McpToolError(
        errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ')
      )
    }
    if (
      opts.allowBrandId === false &&
      (instance as { brandId?: string | null }).brandId != null
    ) {
      throw new McpToolError('brandId is not supported')
    }
    return instance
  }

  /**
   * Maps expected domain errors to McpToolError. Anything else is rethrown so
   * runTool logs it and returns a generic message (no internals leak).
   */
  private async run<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof McpToolError) throw error
      if (error instanceof HttpException) throw new McpToolError(error.message)
      if (isPrismaUniqueConstraintError(error)) {
        throw new McpToolError('Flag key already exists in this project')
      }
      throw error
    }
  }
}
