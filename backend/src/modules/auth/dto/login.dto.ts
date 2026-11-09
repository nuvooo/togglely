import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email: string

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  @MaxLength(128)
  password: string
}
