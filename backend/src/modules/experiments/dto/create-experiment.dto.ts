import { IsString, IsOptional, IsInt, Min, Max, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateVariantDto {
  @IsString()
  key: string

  @IsString()
  name: string

  @IsOptional()
  @IsString()
  description?: string

  @IsString()
  value: string

  @IsInt()
  @Min(0)
  @Max(100)
  weight: number

  @IsOptional()
  isControl?: boolean
}

export class CreateExperimentDto {
  @IsString()
  name: string

  @IsString()
  key: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  hypothesis?: string

  @IsString()
  flagId: string

  @IsString()
  environmentId: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  trafficPercent?: number

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[]
}
