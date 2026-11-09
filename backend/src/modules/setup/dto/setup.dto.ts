import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'
import { IsPasswordPolicy } from '../../auth/dto/password-policy.decorator'

export class SetupDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(200)
  name: string

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email: string

  @IsPasswordPolicy()
  password: string

  @IsString()
  @MinLength(1, { message: 'Organization name is required' })
  @MaxLength(100)
  organizationName: string
}
