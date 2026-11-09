import { applyDecorators } from '@nestjs/common'
import { IsString, Matches, MaxLength, MinLength } from 'class-validator'

/**
 * Shared password policy: 8-128 chars, at least one lowercase letter,
 * one uppercase letter and one digit. The upper bound protects bcrypt,
 * which silently truncates input after 72 bytes and is CPU-expensive.
 */
export function IsPasswordPolicy(field = 'Password') {
  return applyDecorators(
    IsString(),
    MinLength(8, { message: `${field} must be at least 8 characters` }),
    MaxLength(128, { message: `${field} must be at most 128 characters` }),
    Matches(/(?=.*[a-z])/, {
      message: `${field} must contain at least one lowercase letter`,
    }),
    Matches(/(?=.*[A-Z])/, {
      message: `${field} must contain at least one uppercase letter`,
    }),
    Matches(/(?=.*\d)/, {
      message: `${field} must contain at least one number`,
    })
  )
}
