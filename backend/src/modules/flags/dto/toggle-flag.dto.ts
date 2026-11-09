import { IsBoolean, IsMongoId, IsOptional } from 'class-validator'

export class ToggleFlagDto {
  @IsMongoId()
  environmentId: string

  @IsBoolean()
  @IsOptional()
  enabled?: boolean
}
