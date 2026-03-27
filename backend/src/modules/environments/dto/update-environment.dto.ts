import { IsOptional, IsString } from 'class-validator'

export class UpdateEnvironmentDto {
  @IsString()
  @IsOptional()
  name?: string
}
