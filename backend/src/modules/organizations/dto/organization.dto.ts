import { OrganizationRole } from '@prisma/client'
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator'

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,64}$/, {
    message:
      'slug may only contain lowercase letters, digits and dashes (max 64)',
  })
  slug?: string
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string
}

export class AddMemberDto {
  @IsEmail()
  @MaxLength(254)
  email: string

  @IsOptional()
  @IsEnum(OrganizationRole)
  role?: OrganizationRole
}

export class CreateInviteDto {
  /** Optional: without an email the invite is an open link. */
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string

  @IsOptional()
  @IsEnum(OrganizationRole)
  role?: OrganizationRole
}

export class UpdateMemberRoleDto {
  @IsEnum(OrganizationRole)
  role: OrganizationRole
}
