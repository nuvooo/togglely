import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class ToggleFlagDto {
  @IsString()
  environmentId: string

  @IsBoolean()
  @IsOptional()
  enabled?: boolean
}
