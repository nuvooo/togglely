import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import {
  EXPERIMENT_NAME_MAX_LENGTH,
  EXPERIMENT_TEXT_MAX_LENGTH,
} from './limits'

export class UpdateExperimentDto {
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
  @MaxLength(EXPERIMENT_TEXT_MAX_LENGTH)
  hypothesis?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  trafficPercent?: number
}
