import {
  IsEmail,
  IsHexadecimal,
  IsString,
  Length,
  MaxLength,
} from 'class-validator'
import { IsPasswordPolicy } from '../../auth/dto/password-policy.decorator'

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email: string
}

export class ValidateResetTokenDto {
  @IsString()
  @IsHexadecimal()
  @Length(64, 64)
  token: string
}

export class ResetPasswordDto extends ValidateResetTokenDto {
  @IsPasswordPolicy()
  password: string
}

/** Legacy payload of POST /password-reset/verify. */
export class LegacyResetPasswordDto extends ValidateResetTokenDto {
  @IsPasswordPolicy()
  newPassword: string
}
