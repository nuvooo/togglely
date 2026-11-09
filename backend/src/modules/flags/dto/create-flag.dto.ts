import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidationOptions,
  registerDecorator,
} from 'class-validator'
import {
  FLAG_DESCRIPTION_MAX_LENGTH,
  FLAG_INITIAL_VALUES_MAX_ENTRIES,
  FLAG_KEY_MAX_LENGTH,
  FLAG_NAME_MAX_LENGTH,
  FLAG_VALUE_MAX_LENGTH,
} from './limits'

/**
 * Validates `initialValues`: a map of environment key -> { enabled?: boolean,
 * value?: string } with bounded size, so arbitrary objects/huge payloads are
 * never written to the database.
 */
function IsFlagInitialValues(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isFlagInitialValues',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must map environment keys to { enabled?: boolean, value?: string }`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (
            value === null ||
            typeof value !== 'object' ||
            Array.isArray(value)
          ) {
            return false
          }
          const entries = Object.entries(value as Record<string, unknown>)
          if (entries.length > FLAG_INITIAL_VALUES_MAX_ENTRIES) return false
          return entries.every(([envKey, entry]) => {
            if (envKey.length > FLAG_KEY_MAX_LENGTH) return false
            if (
              entry === null ||
              typeof entry !== 'object' ||
              Array.isArray(entry)
            ) {
              return false
            }
            const {
              enabled,
              value: v,
              ...rest
            } = entry as Record<string, unknown>
            if (Object.keys(rest).length > 0) return false
            if (enabled !== undefined && typeof enabled !== 'boolean')
              return false
            if (
              v !== undefined &&
              (typeof v !== 'string' || v.length > FLAG_VALUE_MAX_LENGTH)
            ) {
              return false
            }
            return true
          })
        },
      },
    })
  }
}

export class CreateFlagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(FLAG_NAME_MAX_LENGTH)
  name: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(FLAG_KEY_MAX_LENGTH)
  key: string

  @IsString()
  @IsOptional()
  @MaxLength(FLAG_DESCRIPTION_MAX_LENGTH)
  description?: string

  @IsIn(['BOOLEAN', 'STRING', 'NUMBER', 'JSON'])
  type: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'

  @IsObject()
  @IsFlagInitialValues()
  @IsOptional()
  initialValues?: Record<string, { enabled: boolean; value: string }>
}
