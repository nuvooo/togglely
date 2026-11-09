import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  ValidateNested,
  ValidationOptions,
} from 'class-validator'
import { Type } from 'class-transformer'

export const TRACK_EVENT_TYPES = ['exposure', 'conversion', 'custom'] as const
export type TrackEventType = (typeof TRACK_EVENT_TYPES)[number]

export const MAX_EVENTS_PER_BATCH = 100
export const MAX_EVENT_KEY_LENGTH = 256
export const MAX_EVENT_METADATA_BYTES = 4096

/** Returns the serialized size of a metadata value, or Infinity if not serializable. */
export function metadataSize(value: unknown): number {
  try {
    const json = JSON.stringify(value)
    return json === undefined ? 0 : Buffer.byteLength(json, 'utf8')
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function MaxJsonSize(maxBytes: number, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'maxJsonSize',
      target: object.constructor,
      propertyName,
      constraints: [maxBytes],
      options: {
        message: `${propertyName} must not exceed ${maxBytes} bytes when serialized`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return value === undefined || metadataSize(value) <= maxBytes
        },
      },
    })
  }
}

export class TrackEventDto {
  @IsIn(TRACK_EVENT_TYPES)
  type: TrackEventType

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_EVENT_KEY_LENGTH)
  experimentKey: string

  @IsOptional()
  @IsString()
  @MaxLength(MAX_EVENT_KEY_LENGTH)
  variantKey?: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_EVENT_KEY_LENGTH)
  userId: string

  @IsOptional()
  @IsObject()
  @MaxJsonSize(MAX_EVENT_METADATA_BYTES)
  metadata?: Record<string, unknown>

  // Accepted for SDK compatibility (number or ISO string); not persisted.
  @IsOptional()
  timestamp?: number | string
}

export class TrackEventsDto {
  @IsArray()
  @ArrayMaxSize(MAX_EVENTS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events: TrackEventDto[]
}
