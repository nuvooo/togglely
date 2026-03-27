import { IsOptional, IsString, MinLength } from 'class-validator'

export class CreateBrandDto {
  @IsString()
  @MinLength(1)
  name: string

  @IsString()
  @MinLength(1)
  key: string

  @IsString()
  @IsOptional()
  description?: string
}
