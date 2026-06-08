import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator'

export class UpdateExperimentDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  hypothesis?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  trafficPercent?: number
}
