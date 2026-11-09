import { IsEmail, MaxLength } from 'class-validator'
import { NormalizeEmail } from '../../../shared/validation/normalize-email'

export class ResendVerificationDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email: string
}
