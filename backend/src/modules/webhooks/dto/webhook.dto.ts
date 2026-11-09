import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export const WEBHOOK_URL_MAX_LENGTH = 2048
export const WEBHOOK_DESCRIPTION_MAX_LENGTH = 200
export const WEBHOOK_MAX_ENVIRONMENTS = 20

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(WEBHOOK_URL_MAX_LENGTH)
  url: string

  @IsOptional()
  @IsString()
  @MaxLength(WEBHOOK_DESCRIPTION_MAX_LENGTH)
  description?: string

  /** Empty or omitted = all environments of the project */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WEBHOOK_MAX_ENVIRONMENTS)
  @IsMongoId({ each: true })
  environmentIds?: string[]

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(WEBHOOK_URL_MAX_LENGTH)
  url?: string

  /** Empty string clears the description */
  @IsOptional()
  @IsString()
  @MaxLength(WEBHOOK_DESCRIPTION_MAX_LENGTH)
  description?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WEBHOOK_MAX_ENVIRONMENTS)
  @IsMongoId({ each: true })
  environmentIds?: string[]

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
