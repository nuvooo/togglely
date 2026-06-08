import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class TrackEventDto {
  @IsEnum(['exposure', 'conversion', 'custom'])
  type: 'exposure' | 'conversion' | 'custom'

  @IsString()
  experimentKey: string

  @IsOptional()
  @IsString()
  variantKey?: string

  @IsString()
  userId: string

  @IsOptional()
  metadata?: Record<string, unknown>

  @IsOptional()
  timestamp?: number
}

export class TrackEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events: TrackEventDto[]
}
