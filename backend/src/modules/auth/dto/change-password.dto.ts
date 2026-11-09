import { IsString, MaxLength, MinLength } from 'class-validator'
import { IsPasswordPolicy } from './password-policy.decorator'

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Current password is required' })
  @MaxLength(128)
  currentPassword: string

  @IsPasswordPolicy('New password')
  newPassword: string
}
