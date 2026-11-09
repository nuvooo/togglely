import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key: string

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string

  @IsIn(['SINGLE', 'MULTI'])
  @IsOptional()
  type?: 'SINGLE' | 'MULTI' = 'SINGLE'

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @IsOptional()
  allowedOrigins?: string[] = []
}
