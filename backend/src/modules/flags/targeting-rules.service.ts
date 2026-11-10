import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { FlagType, RuleOperator } from '@prisma/client'
import { isObjectId } from '../../shared/access/access.service'
import { PrismaService } from '../../shared/prisma.service'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { writeAudit } from '../audit-logs/write-audit'
import { ChangeEventsService } from '../change-events/change-events.service'
import { groupConditions } from '../sdk/condition-groups'
import { isRegexPatternAllowed } from '../sdk/evaluation.service'
import { nextBoundaryAfter } from '../sdk/rule-schedule'
import { RuleScope, scopedEnvironmentIds } from '../sdk/rule-scope'
import {
  ConditionGroupDto,
  CreateTargetingRuleDto,
  RULE_CONDITIONS_MAX,
  RuleConditionDto,
  UpdateTargetingRuleDto,
} from './dto/targeting-rule.dto'

const RULE_INCLUDE = {
  // createMany shares one createdAt; the id keeps the insertion order
  conditions: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
}

type RuleWithRelations = RuleScope & {
  id: string
  name: string | null
  operator: RuleOperator
  groupOperators?: RuleOperator[]
  serveValue: string
  priority: number
  isDefault: boolean
  enabled: boolean
  activeFrom?: Date | null
  activeUntil?: Date | null
  createdAt: Date
  updatedAt: Date
  conditions: {
    id: string
    attribute: string
    operator: string
    value: string
    groupIndex?: number | null
  }[]
}

const toConditionResponse = (c: RuleWithRelations['conditions'][number]) => ({
  id: c.id,
  attribute: c.attribute,
  operator: c.operator,
  value: c.value,
})

interface FlagRef {
  id: string
  key: string
  projectId: string
  organizationId: string
}

interface ScopeFields {
  environmentIds?: string[]
  environmentsExcluded?: boolean
  brandIds?: string[]
  brandsExcluded?: boolean
}

/**
 * CRUD for targeting rules. Rules are flag-wide; each rule's scope
 * (environments and brands, "one of" or "none of", empty = all) decides
 * where it applies, see ruleAppliesTo. Access checks are done by the
 * controller; scope ids are checked against the flag's project here.
 */
@Injectable()
export class TargetingRulesService {
  private readonly logger = new Logger(TargetingRulesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly changes: ChangeEventsService
  ) {}

  /** All rules of the flag in priority order. */
  async findAll(flagId: string) {
    const rules = await this.prisma.targetingRule.findMany({
      where: { flagId },
      include: RULE_INCLUDE,
      orderBy: { priority: 'asc' },
    })
    return rules.map((r) => this.toResponse(r))
  }

  async create(flag: FlagRef, dto: CreateTargetingRuleDto, userId: string) {
    const flagType = await this.getFlagType(flag.id)
    this.validateServeValue(flagType, dto.serveValue)
    const groups = this.conditionData(dto, 'AND')
    if (!groups) {
      throw new BadRequestException('At least one condition is required')
    }
    const window = {
      activeFrom: null,
      activeUntil: null,
      nextBoundaryAt: null,
      ...this.windowData(dto),
    }
    const scope = {
      environmentIds: [] as string[],
      environmentsExcluded: false,
      brandIds: [] as string[],
      brandsExcluded: false,
      ...(await this.scopeData(flag, {
        ...dto,
        // Legacy shorthand of clients that created rules per environment
        environmentIds:
          dto.environmentIds ??
          (dto.environmentId ? [dto.environmentId] : undefined),
        brandIds: dto.brandIds ?? (dto.brandId ? [dto.brandId] : undefined),
      })),
    }

    const priority =
      dto.priority ??
      ((
        await this.prisma.targetingRule.findFirst({
          where: { flagId: flag.id },
          orderBy: { priority: 'desc' },
          select: { priority: true },
        })
      )?.priority ?? -1) + 1

    const rule = await this.prisma.targetingRule.create({
      data: {
        flagId: flag.id,
        ...scope,
        name: dto.name ?? null,
        operator: groups.operator,
        groupOperators: groups.groupOperators,
        serveValue: dto.serveValue,
        priority,
        enabled: dto.enabled ?? true,
        ...window,
        conditions: { create: groups.conditions },
      },
      include: RULE_INCLUDE,
    })
    this.recordRulesChanged(flag, [rule])

    await this.audit('targeting_rule.created', flag, rule.id, userId, {
      ...scope,
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
    const groups = this.conditionData(dto, existing.operator)
    // Rules with one group keep rule and group operator in sync, so clients
    // that only know `operator` keep working
    const groupOperators =
      groups?.groupOperators ??
      (dto.operator && existing.groupOperators.length <= 1
        ? [dto.operator]
        : undefined)
    const window = this.windowData(dto, existing)
    const scope = await this.scopeData(flag, dto)

    const rule = await this.prisma.$transaction(async (tx) => {
      if (groups) {
        await tx.ruleCondition.deleteMany({ where: { ruleId } })
        await tx.ruleCondition.createMany({
          data: groups.conditions.map((c) => ({ ruleId, ...c })),
        })
      }
      return tx.targetingRule.update({
        where: { id: ruleId },
        data: {
          name: dto.name,
          operator: groups?.operator ?? dto.operator,
          groupOperators,
          serveValue: dto.serveValue,
          priority: dto.priority,
          enabled: dto.enabled,
          ...scope,
          ...window,
        },
        include: RULE_INCLUDE,
      })
    })

    // Old and new scope: SDK results can change in both
    this.recordRulesChanged(flag, [existing, rule])

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
    this.recordRulesChanged(flag, [existing])
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

  /** Loads a rule and ensures it belongs to the given flag. */
  private async findRuleOfFlag(flagId: string, ruleId: string) {
    const rule = isObjectId(ruleId)
      ? await this.prisma.targetingRule.findFirst({
          where: { id: ruleId, flagId },
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

  /**
   * Scope fields of a write. Environment and brand ids must belong to the
   * flag's project (unknown ids: 404, like other cross-project ids).
   */
  private async scopeData(flag: FlagRef, dto: ScopeFields) {
    const data: ScopeFields = {}
    if (dto.environmentIds !== undefined) {
      const ids = [...new Set(dto.environmentIds)]
      const found = await this.prisma.environment.count({
        where: { id: { in: ids }, projectId: flag.projectId },
      })
      if (found !== ids.length) {
        throw new NotFoundException('Environment not found')
      }
      data.environmentIds = ids
    }
    if (dto.brandIds !== undefined) {
      const ids = [...new Set(dto.brandIds)]
      const found = await this.prisma.brand.count({
        where: { id: { in: ids }, projectId: flag.projectId },
      })
      if (found !== ids.length) throw new NotFoundException('Brand not found')
      data.brandIds = ids
    }
    if (dto.environmentsExcluded !== undefined) {
      data.environmentsExcluded = dto.environmentsExcluded
    }
    if (dto.brandsExcluded !== undefined) {
      data.brandsExcluded = dto.brandsExcluded
    }
    return data
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

  private toCondition(c: RuleConditionDto, groupIndex: number) {
    return {
      attribute: c.attribute,
      operator: c.operator,
      value: c.value,
      groupIndex,
    }
  }

  /**
   * Conditions to store (with their group) and the operators, from either
   * flat `conditions` (one group combined with `operator`) or `groups`
   * (`operator` combines the groups). Null when the DTO sets neither.
   */
  private conditionData(
    dto: {
      operator?: RuleOperator
      conditions?: RuleConditionDto[]
      groups?: ConditionGroupDto[]
    },
    defaultOperator: RuleOperator
  ) {
    if (dto.conditions && dto.groups) {
      throw new BadRequestException('Use either conditions or groups, not both')
    }
    const operator = dto.operator ?? defaultOperator
    if (dto.groups) {
      const all = dto.groups.flatMap((g) => g.conditions)
      if (all.length > RULE_CONDITIONS_MAX) {
        throw new BadRequestException(
          `At most ${RULE_CONDITIONS_MAX} conditions are allowed`
        )
      }
      this.validateConditions(all)
      return {
        operator,
        groupOperators: dto.groups.map((g) => g.operator),
        conditions: dto.groups.flatMap((g, index) =>
          g.conditions.map((c) => this.toCondition(c, index))
        ),
      }
    }
    if (dto.conditions) {
      this.validateConditions(dto.conditions)
      return {
        operator,
        groupOperators: [operator],
        conditions: dto.conditions.map((c) => this.toCondition(c, 0)),
      }
    }
    return null
  }

  private toResponse(rule: RuleWithRelations) {
    return {
      id: rule.id,
      environmentIds: rule.environmentIds ?? [],
      environmentsExcluded: rule.environmentsExcluded ?? false,
      brandIds: rule.brandIds ?? [],
      brandsExcluded: rule.brandsExcluded ?? false,
      name: rule.name,
      operator: rule.operator,
      serveValue: rule.serveValue,
      priority: rule.priority,
      isDefault: rule.isDefault,
      enabled: rule.enabled,
      activeFrom: rule.activeFrom?.toISOString() ?? null,
      activeUntil: rule.activeUntil?.toISOString() ?? null,
      conditions: rule.conditions.map(toConditionResponse),
      groups: groupConditions(rule).map((group) => ({
        operator: group.operator,
        conditions: group.conditions.map(toConditionResponse),
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
      nextBoundaryAt: nextBoundaryAfter(
        { activeFrom, activeUntil },
        new Date()
      ),
    }
  }

  /** Announces the change in every environment the rules (can) apply to. */
  private recordRulesChanged(flag: FlagRef, rules: RuleScope[]) {
    void this.changes.recordChange({
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      environmentIds: scopedEnvironmentIds(rules),
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
