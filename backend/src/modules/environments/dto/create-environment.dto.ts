import { IsString, MinLength } from 'class-validator'

export class CreateEnvironmentDto {
  @IsString()
  @MinLength(1)
  name: string

  @IsString()
  @MinLength(1)
  key: string

  @IsString()
  organizationId: string
}
