import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'
import { FLAG_VALUE_MAX_LENGTH } from './limits'

export class UpdateFlagEnvironmentDto {
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean

  @IsString()
  @IsOptional()
  @MaxLength(FLAG_VALUE_MAX_LENGTH)
  defaultValue?: string
}
