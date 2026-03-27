import { IsOptional, IsString } from 'class-validator'

export class UpdateFlagDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsString()
  @IsOptional()
  description?: string
}
