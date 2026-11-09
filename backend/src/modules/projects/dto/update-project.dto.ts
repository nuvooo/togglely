import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

export const PROJECT_TYPES = ['SINGLE', 'MULTI'] as const

/**
 * Whitelisted fields that may be changed on an existing project.
 * `key` and `organizationId` are intentionally NOT updatable.
 */
export class UpdateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  name?: string

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string

  @IsIn(PROJECT_TYPES)
  @IsOptional()
  type?: 'SINGLE' | 'MULTI'

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @IsOptional()
  allowedOrigins?: string[]
}
