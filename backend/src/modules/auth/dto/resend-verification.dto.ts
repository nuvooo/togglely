import { IsEmail, MaxLength } from 'class-validator'

export class ResendVerificationDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email: string
}
