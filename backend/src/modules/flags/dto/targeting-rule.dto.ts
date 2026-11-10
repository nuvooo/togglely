import { ConditionOperator, RuleOperator } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

class TargetingRuleFieldsDto {
  @IsString()
  @IsOptional()
  @MaxLength(FLAG_NAME_MAX_LENGTH)
  name?: string

  @IsEnum(RuleOperator)
  @IsOptional()
  operator?: RuleOperator

  @IsInt()
  @Min(0)
  @Max(10000)
  @IsOptional()
  priority?: number

  @IsBoolean()
  @IsOptional()
  enabled?: boolean
}

export class CreateTargetingRuleDto extends TargetingRuleFieldsDto {
  @IsMongoId()
  environmentId: string

  /** Creates the rule for this brand (brand override) instead of the environment. */
  @IsMongoId()
  @IsOptional()
  brandId?: string

  @IsString()
  @MaxLength(FLAG_VALUE_MAX_LENGTH)
  serveValue: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RULE_CONDITIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions: RuleConditionDto[]
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
