import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import { NormalizeEmail } from '../../../shared/validation/normalize-email'
import { IsPasswordPolicy } from '../../auth/dto/password-policy.decorator'

export class SetupDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(200)
  name: string

  @NormalizeEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email: string

  @IsPasswordPolicy()
  password: string

  @IsString()
  @MinLength(1, { message: 'Organization name is required' })
  @MaxLength(100)
  organizationName: string

  /** Required when the instance sets SETUP_TOKEN. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  setupToken?: string
}
