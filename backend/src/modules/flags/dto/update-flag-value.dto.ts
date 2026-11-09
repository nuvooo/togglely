import {
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'
import { FLAG_VALUE_MAX_LENGTH } from './limits'

export class UpdateFlagValueDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean

  @IsString()
  @IsOptional()
  @MaxLength(FLAG_VALUE_MAX_LENGTH)
  value?: string

  // Brand ids are MongoDB ObjectIds. null/undefined = environment default.
  @IsMongoId()
  @IsOptional()
  brandId?: string | null
}
