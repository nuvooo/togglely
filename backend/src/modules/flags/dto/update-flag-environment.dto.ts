import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class UpdateFlagEnvironmentDto {
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean

  @IsString()
  @IsOptional()
  defaultValue?: string
}
