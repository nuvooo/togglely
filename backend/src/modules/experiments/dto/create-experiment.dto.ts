import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  EXPERIMENT_KEY_MAX_LENGTH,
  EXPERIMENT_MAX_VARIANTS,
  EXPERIMENT_NAME_MAX_LENGTH,
  EXPERIMENT_TEXT_MAX_LENGTH,
  VARIANT_VALUE_MAX_LENGTH,
} from './limits'

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXPERIMENT_KEY_MAX_LENGTH)
  key: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(EXPERIMENT_NAME_MAX_LENGTH)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(EXPERIMENT_TEXT_MAX_LENGTH)
  description?: string

  @IsString()
  @MaxLength(VARIANT_VALUE_MAX_LENGTH)
  value: string

  @IsInt()
  @Min(0)
  @Max(100)
  weight: number

  @IsOptional()
  @IsBoolean()
  isControl?: boolean
}

/**
 * Body for PATCH /experiments/:id/variants/:variantId. A real class is
 * required: `Partial<CreateVariantDto>` is erased at runtime, so the global
 * ValidationPipe would not validate (or whitelist) the body at all.
 */
export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXPERIMENT_KEY_MAX_LENGTH)
  key?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXPERIMENT_NAME_MAX_LENGTH)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(EXPERIMENT_TEXT_MAX_LENGTH)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(VARIANT_VALUE_MAX_LENGTH)
  value?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number

  @IsOptional()
  @IsBoolean()
  isControl?: boolean
}

/**
 * Note: projectId/organizationId are intentionally NOT accepted here; they
 * are derived from the referenced flag on the server.
 */
export class CreateExperimentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(EXPERIMENT_NAME_MAX_LENGTH)
  name: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(EXPERIMENT_KEY_MAX_LENGTH)
  key: string

  @IsOptional()
  @IsString()
  @MaxLength(EXPERIMENT_TEXT_MAX_LENGTH)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(EXPERIMENT_TEXT_MAX_LENGTH)
  hypothesis?: string

  @IsMongoId()
  flagId: string

  @IsMongoId()
  environmentId: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  trafficPercent?: number

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EXPERIMENT_MAX_VARIANTS)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[]
}
