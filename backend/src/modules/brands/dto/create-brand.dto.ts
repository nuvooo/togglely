import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateBrandDto {
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
}
