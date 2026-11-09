import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class UpdateBrandDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  name?: string

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string
}
