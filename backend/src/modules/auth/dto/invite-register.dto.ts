import { IsString, MaxLength, MinLength } from 'class-validator'
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
}
