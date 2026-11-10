import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { FlagType } from '@prisma/client'
import { isObjectId } from '../../shared/access/access.service'
import { PrismaService } from '../../shared/prisma.service'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { writeAudit } from '../audit-logs/write-audit'
import { ChangeEventsService } from '../change-events/change-events.service'
import { isRegexPatternAllowed } from '../sdk/evaluation.service'
import { nextBoundaryAfter } from '../sdk/rule-schedule'
import { getDefaultFlagValue } from '../sdk/sdk.helpers'
import {
  CreateTargetingRuleDto,
  RuleConditionDto,
  UpdateTargetingRuleDto,
} from './dto/targeting-rule.dto'

const RULE_INCLUDE = {
  conditions: { orderBy: { createdAt: 'asc' as const } },
  flagEnvironment: { select: { environmentId: true, brandId: true } },
}

type RuleWithRelations = {
  id: string
  name: string | null
  operator: string
  serveValue: string
  priority: number
  isDefault: boolean
  enabled: boolean
  activeFrom?: Date | null
  activeUntil?: Date | null
  createdAt: Date
  updatedAt: Date
  flagEnvironment: { environmentId: string; brandId: string | null }
  conditions: {
    id: string
    attribute: string
    operator: string
    value: string
  }[]
}

interface FlagRef {
  id: string
  key: string
  projectId: string
  organizationId: string
}

/**
 * CRUD for targeting rules. Rules belong to the environment-level
 * FlagEnvironment (brandId = null) or to a brand override. A brand without
 * own rules inherits the environment rules (see SdkService).
 * Access checks are done by the controller.
 */
@Injectable()
export class TargetingRulesService {
  private readonly logger = new Logger(TargetingRulesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly changes: ChangeEventsService
  ) {}

  /**
   * Environment rules, or the rules of a brand (needs environmentId). A
   * brand without own rules gets the environment rules with
   * `inherited: true`.
   */
  async findAll(flagId: string, environmentId?: string, brandId?: string) {
    if (brandId && environmentId) {
      const own = await this.findRules(flagId, environmentId, brandId)
      if (own.length > 0) return { rules: own, inherited: false }
      return {
        rules: await this.findRules(flagId, environmentId, null),
        inherited: true,
      }
    }
    return {
      rules: await this.findRules(flagId, environmentId, null),
      inherited: false,
    }
  }

  private async findRules(
    flagId: string,
    environmentId: string | undefined,
    brandId: string | null
  ) {
    const rules = await this.prisma.targetingRule.findMany({
      where: {
        flagEnvironment: {
          flagId,
          brandId,
          ...(environmentId ? { environmentId } : {}),
        },
      },
      include: RULE_INCLUDE,
      orderBy: { priority: 'asc' },
    })
    return rules.map((r) => this.toResponse(r))
  }

  async create(flag: FlagRef, dto: CreateTargetingRuleDto, userId: string) {
    const flagType = await this.getFlagType(flag.id)
    this.validateServeValue(flagType, dto.serveValue)
    this.validateConditions(dto.conditions)
    const window = {
      activeFrom: null,
      activeUntil: null,
      nextBoundaryAt: null,
      ...this.windowData(dto),
    }

    const flagEnv = dto.brandId
      ? await this.getOrCreateBrandFlagEnvironment(
          flag.id,
          dto.environmentId,
          dto.brandId,
          flagType
        )
      : await this.getOrCreateFlagEnvironment(
          flag.id,
          dto.environmentId,
          flagType
        )

    const priority =
      dto.priority ??
      ((
        await this.prisma.targetingRule.findFirst({
          where: { flagEnvId: flagEnv.id },
          orderBy: { priority: 'desc' },
          select: { priority: true },
        })
      )?.priority ?? -1) + 1

    const rule = await this.prisma.targetingRule.create({
      data: {
        flagEnvId: flagEnv.id,
        name: dto.name ?? null,
        operator: dto.operator ?? 'AND',
        serveValue: dto.serveValue,
        priority,
        enabled: dto.enabled ?? true,
        ...window,
        conditions: { create: dto.conditions.map((c) => this.toCondition(c)) },
      },
      include: RULE_INCLUDE,
    })
    this.recordRulesChanged(flag, rule.flagEnvironment.environmentId)

    await this.audit('targeting_rule.created', flag, rule.id, userId, {
      environmentId: dto.environmentId,
      ...(dto.brandId ? { brandId: dto.brandId } : {}),
      serveValue: rule.serveValue,
    })

    return this.toResponse(rule)
  }

  async update(
    flag: FlagRef,
    ruleId: string,
    dto: UpdateTargetingRuleDto,
    userId: string
  ) {
    const existing = await this.findRuleOfFlag(flag.id, ruleId)

    if (dto.serveValue !== undefined) {
      this.validateServeValue(await this.getFlagType(flag.id), dto.serveValue)
    }
    if (dto.conditions) {
      this.validateConditions(dto.conditions)
    }
    const window = this.windowData(dto, existing)

    const rule = await this.prisma.$transaction(async (tx) => {
      if (dto.conditions) {
        await tx.ruleCondition.deleteMany({ where: { ruleId } })
        await tx.ruleCondition.createMany({
          data: dto.conditions.map((c) => ({ ruleId, ...this.toCondition(c) })),
        })
      }
      return tx.targetingRule.update({
        where: { id: ruleId },
        data: {
          name: dto.name,
          operator: dto.operator,
          serveValue: dto.serveValue,
          priority: dto.priority,
          enabled: dto.enabled,
          ...window,
        },
        include: RULE_INCLUDE,
      })
    })

    this.recordRulesChanged(flag, rule.flagEnvironment.environmentId)

    await this.audit('targeting_rule.updated', flag, ruleId, userId, dto, {
      serveValue: existing.serveValue,
      enabled: existing.enabled,
    })

    return this.toResponse(rule)
  }

  async delete(flag: FlagRef, ruleId: string, userId: string) {
    const existing = await this.findRuleOfFlag(flag.id, ruleId)
    await this.prisma.$transaction([
      this.prisma.ruleCondition.deleteMany({ where: { ruleId } }),
      this.prisma.targetingRule.delete({ where: { id: ruleId } }),
    ])
    this.recordRulesChanged(flag, existing.flagEnvironment.environmentId)
    await this.audit(
      'targeting_rule.deleted',
      flag,
      ruleId,
      userId,
      undefined,
      {
        name: existing.name,
        serveValue: existing.serveValue,
        enabled: existing.enabled,
      }
    )
  }

  /**
   * Deletes all own rules of a brand override; the brand then inherits the
   * environment rules again. The override values (enabled, default) stay.
   */
  async resetBrandRules(
    flag: FlagRef,
    environmentId: string,
    brandId: string,
    userId: string
  ) {
    const brandEnv = await this.prisma.flagEnvironment.findFirst({
      where: { flagId: flag.id, environmentId, brandId },
      select: { id: true },
    })
    const ruleIds = brandEnv
      ? (
          await this.prisma.targetingRule.findMany({
            where: { flagEnvId: brandEnv.id },
            select: { id: true },
          })
        ).map((r) => r.id)
      : []
    if (!brandEnv || ruleIds.length === 0) return { deleted: 0 }

    await this.prisma.$transaction([
      this.prisma.ruleCondition.deleteMany({
        where: { ruleId: { in: ruleIds } },
      }),
      this.prisma.targetingRule.deleteMany({
        where: { flagEnvId: brandEnv.id },
      }),
    ])
    this.recordRulesChanged(flag, environmentId)
    await this.audit('targeting_rule.brand_reset', flag, brandEnv.id, userId, {
      environmentId,
      brandId,
      deletedRules: ruleIds.length,
    })
    return { deleted: ruleIds.length }
  }

  /** Loads a rule and ensures it belongs to the given flag. */
  private async findRuleOfFlag(flagId: string, ruleId: string) {
    const rule = isObjectId(ruleId)
      ? await this.prisma.targetingRule.findFirst({
          where: { id: ruleId, flagEnvironment: { flagId } },
          include: { flagEnvironment: { select: { environmentId: true } } },
        })
      : null
    if (!rule) throw new NotFoundException('Targeting rule not found')
    return rule
  }

  private async getFlagType(flagId: string): Promise<FlagType> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
      select: { flagType: true },
    })
    if (!flag) throw new NotFoundException('Feature flag not found')
    return flag.flagType
  }

  private async getOrCreateFlagEnvironment(
    flagId: string,
    environmentId: string,
    flagType: FlagType
  ) {
    const existing = await this.prisma.flagEnvironment.findFirst({
      where: { flagId, environmentId, brandId: null },
      select: { id: true },
    })
    if (existing) return existing

    return this.prisma.flagEnvironment.create({
      data: {
        flagId,
        environmentId,
        brandId: null,
        enabled: false,
        defaultValue: getDefaultFlagValue(flagType),
      },
      select: { id: true },
    })
  }

  /**
   * Brand override row; created on the first brand rule with the current
   * environment values, so the brand keeps behaving the same.
   */
  private async getOrCreateBrandFlagEnvironment(
    flagId: string,
    environmentId: string,
    brandId: string,
    flagType: FlagType
  ) {
    const existing = await this.prisma.flagEnvironment.findFirst({
      where: { flagId, environmentId, brandId },
      select: { id: true },
    })
    if (existing) return existing

    const envDefault = await this.prisma.flagEnvironment.findFirst({
      where: { flagId, environmentId, brandId: null },
      select: { enabled: true, defaultValue: true },
    })
    return this.prisma.flagEnvironment.create({
      data: {
        flagId,
        environmentId,
        brandId,
        enabled: envDefault?.enabled ?? false,
        defaultValue: envDefault?.defaultValue ?? getDefaultFlagValue(flagType),
      },
      select: { id: true },
    })
  }

  /** The served value must be valid for the flag type. */
  validateServeValue(flagType: FlagType, value: string) {
    const fail = (message: string) => {
      throw new BadRequestException(message)
    }
    switch (flagType) {
      case 'BOOLEAN':
        if (value !== 'true' && value !== 'false') {
          fail('serveValue must be "true" or "false" for boolean flags')
        }
        break
      case 'NUMBER':
        if (value.trim() === '' || Number.isNaN(Number(value))) {
          fail('serveValue must be a number for number flags')
        }
        break
      case 'JSON':
        try {
          JSON.parse(value)
        } catch {
          fail('serveValue must be valid JSON for JSON flags')
        }
        break
    }
  }

  /** Regex conditions must pass the same ReDoS limits used at evaluation. */
  validateConditions(conditions: RuleConditionDto[]) {
    for (const condition of conditions) {
      if (
        condition.operator === 'MATCHES_REGEX' &&
        !isRegexPatternAllowed(condition.value)
      ) {
        throw new BadRequestException(
          `Invalid or unsafe regular expression for attribute "${condition.attribute}" ` +
            '(max 256 chars, no nested quantifiers like "(a+)+")'
        )
      }
      if (
        (condition.operator === 'GREATER_THAN' ||
          condition.operator === 'LESS_THAN') &&
        Number.isNaN(Number(condition.value))
      ) {
        throw new BadRequestException(
          `Value for ${condition.operator} on "${condition.attribute}" must be a number`
        )
      }
    }
  }

  private toCondition(c: RuleConditionDto) {
    return { attribute: c.attribute, operator: c.operator, value: c.value }
  }

  private toResponse(rule: RuleWithRelations) {
    return {
      id: rule.id,
      environmentId: rule.flagEnvironment.environmentId,
      brandId: rule.flagEnvironment.brandId,
      name: rule.name,
      operator: rule.operator,
      serveValue: rule.serveValue,
      priority: rule.priority,
      isDefault: rule.isDefault,
      enabled: rule.enabled,
      activeFrom: rule.activeFrom?.toISOString() ?? null,
      activeUntil: rule.activeUntil?.toISOString() ?? null,
      conditions: rule.conditions.map((c) => ({
        id: c.id,
        attribute: c.attribute,
        operator: c.operator,
        value: c.value,
      })),
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    }
  }

  /**
   * Window fields for a write: the effective window (stored values unless
   * the DTO sets or clears them) must not end before it starts. Returns
   * nothing when the DTO does not touch the window.
   */
  private windowData(
    dto: { activeFrom?: string | null; activeUntil?: string | null },
    stored: { activeFrom?: Date | null; activeUntil?: Date | null } = {}
  ) {
    if (dto.activeFrom === undefined && dto.activeUntil === undefined) {
      return {}
    }
    const toDate = (
      value: string | null | undefined,
      current?: Date | null
    ): Date | null =>
      value === undefined ? (current ?? null) : value ? new Date(value) : null
    const activeFrom = toDate(dto.activeFrom, stored.activeFrom)
    const activeUntil = toDate(dto.activeUntil, stored.activeUntil)
    if (activeFrom && activeUntil && activeFrom >= activeUntil) {
      throw new BadRequestException('activeFrom must be before activeUntil')
    }
    return {
      activeFrom,
      activeUntil,
      nextBoundaryAt: nextBoundaryAfter({ activeFrom, activeUntil }, new Date()),
    }
  }

  private recordRulesChanged(flag: FlagRef, environmentId: string) {
    void this.changes.recordChange({
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      environmentIds: [environmentId],
      changes: [{ flagKey: flag.key, action: 'rules_changed' }],
    })
  }

  private audit(
    action: string,
    flag: FlagRef,
    ruleId: string,
    userId: string,
    newValues?: unknown,
    oldValues?: unknown
  ) {
    // Names the flag so the flag history finds rule changes
    const ref = { flagId: flag.id, flagKey: flag.key }
    return writeAudit(this.auditLogs, this.logger, {
      action,
      entityType: 'TargetingRule',
      entityId: ruleId,
      userId,
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      newValues: newValues ? { ...ref, ...(newValues as object) } : undefined,
      // A created rule has no previous state.
      oldValues: oldValues ? { ...ref, ...(oldValues as object) } : undefined,
    })
  }
}
