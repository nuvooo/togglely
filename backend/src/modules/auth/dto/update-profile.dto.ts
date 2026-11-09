import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string
}
