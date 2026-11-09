import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { FLAG_DESCRIPTION_MAX_LENGTH, FLAG_NAME_MAX_LENGTH } from './limits'

export class UpdateFlagDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(FLAG_NAME_MAX_LENGTH)
  name?: string

  @IsString()
  @IsOptional()
  @MaxLength(FLAG_DESCRIPTION_MAX_LENGTH)
  description?: string
}
