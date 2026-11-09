import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import { NormalizeEmail } from '../../../shared/validation/normalize-email'
import { IsPasswordPolicy } from './password-policy.decorator'

export class RegisterDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email: string

  @IsPasswordPolicy()
  password: string

  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(200)
  name: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string
}
