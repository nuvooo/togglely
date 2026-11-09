import { IsBoolean, IsMongoId, IsOptional } from 'class-validator'

export class ToggleBrandFlagDto {
  @IsMongoId()
  environmentId: string

  /** Explicit target state. When omitted the current state is inverted. */
  @IsBoolean()
  @IsOptional()
  enabled?: boolean
}
