import { ConditionOperator, RuleOperator } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { FLAG_NAME_MAX_LENGTH, FLAG_VALUE_MAX_LENGTH } from './limits'

/** Max number of conditions per rule. */
export const RULE_CONDITIONS_MAX = 20
/** Max length of a single condition comparison value. */
export const RULE_CONDITION_VALUE_MAX_LENGTH = 1000
/** Context attribute names: letters, digits, `_`, `.` and `-`. */
export const RULE_ATTRIBUTE_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/

export class RuleConditionDto {
  @IsString()
  @Matches(RULE_ATTRIBUTE_PATTERN, {
    message:
      'attribute may only contain letters, digits, "_", "." and "-" (max 100)',
  })
  attribute: string

  @IsEnum(ConditionOperator)
  operator: ConditionOperator

  @IsString()
  @MaxLength(RULE_CONDITION_VALUE_MAX_LENGTH)
  value: string
}

/** Max number of condition groups per rule. */
export const RULE_GROUPS_MAX = 10
/** Max number of environment or brand ids in a rule scope. */
export const RULE_SCOPE_IDS_MAX = 100

/** Conditions combined with the group operator (AND: all, OR: any). */
export class ConditionGroupDto {
  @IsEnum(RuleOperator)
  operator: RuleOperator

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RULE_CONDITIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions: RuleConditionDto[]
}

class TargetingRuleFieldsDto {
  @IsString()
  @IsOptional()
  @MaxLength(FLAG_NAME_MAX_LENGTH)
  name?: string

  /**
   * With `conditions`: combines the conditions. With `groups`: combines the
   * groups.
   */
  @IsEnum(RuleOperator)
  @IsOptional()
  operator?: RuleOperator

  /**
   * Condition groups, e.g. A AND (B OR C). Alternative to `conditions`
   * (which is one group); replaces all conditions when present.
   */
  @IsArray()
  @IsOptional()
  @ArrayMinSize(1)
  @ArrayMaxSize(RULE_GROUPS_MAX)
  @ValidateNested({ each: true })
  @Type(() => ConditionGroupDto)
  groups?: ConditionGroupDto[]

  /** Scope: environments the rule applies to; empty = all. */
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(RULE_SCOPE_IDS_MAX)
  @IsMongoId({ each: true })
  environmentIds?: string[]

  /** true: the rule applies to all environments except environmentIds. */
  @IsBoolean()
  @IsOptional()
  environmentsExcluded?: boolean

  /** Scope: brands the rule applies to; empty = all. */
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(RULE_SCOPE_IDS_MAX)
  @IsMongoId({ each: true })
  brandIds?: string[]

  /** true: the rule applies to all brands (and no brand) except brandIds. */
  @IsBoolean()
  @IsOptional()
  brandsExcluded?: boolean

  @IsInt()
  @Min(0)
  @Max(10000)
  @IsOptional()
  priority?: number

  @IsBoolean()
  @IsOptional()
  enabled?: boolean

  /** ISO timestamp; the rule applies from then on. null clears it (update). */
  @IsDateString({ strict: true })
  @IsOptional()
  activeFrom?: string | null

  /** ISO timestamp; the rule stops applying then. null clears it (update). */
  @IsDateString({ strict: true })
  @IsOptional()
  activeUntil?: string | null
}

export class CreateTargetingRuleDto extends TargetingRuleFieldsDto {
  /** Legacy shorthand for `environmentIds: [environmentId]`. */
  @IsMongoId()
  @IsOptional()
  environmentId?: string

  /** Legacy shorthand for `brandIds: [brandId]`. */
  @IsMongoId()
  @IsOptional()
  brandId?: string

  @IsString()
  @MaxLength(FLAG_VALUE_MAX_LENGTH)
  serveValue: string

  /** One group of conditions; either this or `groups` is required. */
  @IsArray()
  @IsOptional()
  @ArrayMinSize(1)
  @ArrayMaxSize(RULE_CONDITIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions?: RuleConditionDto[]
}

export class UpdateTargetingRuleDto extends TargetingRuleFieldsDto {
  @IsString()
  @IsOptional()
  @MaxLength(FLAG_VALUE_MAX_LENGTH)
  serveValue?: string

  /** Replaces the full condition list when present. */
  @IsArray()
  @IsOptional()
  @ArrayMinSize(1)
  @ArrayMaxSize(RULE_CONDITIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions?: RuleConditionDto[]
}
