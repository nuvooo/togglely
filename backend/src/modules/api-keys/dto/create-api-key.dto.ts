import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  name: string

  @IsString()
  @IsOptional()
  type?: string

  @IsNumber()
  @IsOptional()
  expiresInDays?: number
}
