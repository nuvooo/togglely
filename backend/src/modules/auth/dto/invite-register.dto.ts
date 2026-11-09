import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import { NormalizeEmail } from '../../../shared/validation/normalize-email'
import { IsPasswordPolicy } from './password-policy.decorator'

export class InviteRegisterDto {
  @IsPasswordPolicy()
  password: string

  @IsString()
  @MinLength(1, { message: 'First name is required' })
  @MaxLength(100)
  firstName: string

  @IsString()
  @MaxLength(100)
  lastName: string

  /**
   * Required for open (unbound) invite links; ignored when the invite is
   * bound to an email address.
   */
  @IsOptional()
  @NormalizeEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email?: string
}
