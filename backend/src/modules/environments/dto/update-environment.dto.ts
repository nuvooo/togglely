import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class UpdateEnvironmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string
}
