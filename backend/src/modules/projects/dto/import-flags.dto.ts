import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

export const FLAG_TYPES = ['BOOLEAN', 'STRING', 'NUMBER', 'JSON'] as const

/** Flag/environment keys: alphanumeric start, then letters, digits, `_`, `-`, `.`, `:`. */
export const IMPORT_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/

export class ImportFlagEnvironmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(IMPORT_KEY_PATTERN)
  environmentKey: string

  @IsBoolean()
  enabled: boolean

  @IsString()
  @MaxLength(10000)
  defaultValue: string
}

export class ImportFlagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(IMPORT_KEY_PATTERN)
  key: string

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string | null

  @IsIn(FLAG_TYPES)
  flagType: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportFlagEnvironmentDto)
  @IsOptional()
  environments?: ImportFlagEnvironmentDto[]
}

export class ImportFlagsOptionsDto {
  @IsBoolean()
  @IsOptional()
  overwrite?: boolean

  @IsBoolean()
  @IsOptional()
  skipExisting?: boolean
}

export class ImportFlagsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportFlagDto)
  flags: ImportFlagDto[]

  @ValidateNested()
  @Type(() => ImportFlagsOptionsDto)
  @IsOptional()
  options?: ImportFlagsOptionsDto
}
