import { plainToInstance } from 'class-transformer'
import { InviteRegisterDto } from '../../modules/auth/dto/invite-register.dto'
import { LoginDto } from '../../modules/auth/dto/login.dto'
import { RegisterDto } from '../../modules/auth/dto/register.dto'
import { ResendVerificationDto } from '../../modules/auth/dto/resend-verification.dto'
import {
  AddMemberDto,
  CreateInviteDto,
} from '../../modules/organizations/dto/organization.dto'
import { RequestPasswordResetDto } from '../../modules/password-reset/dto/password-reset.dto'
import { SetupDto } from '../../modules/setup/dto/setup.dto'
import { NormalizeEmail, normalizeEmail } from './normalize-email'

class Body {
  @NormalizeEmail()
  email?: unknown
}

describe('normalizeEmail', () => {
  it('trims and lowercases strings', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com')
  })

  it('leaves non-strings untouched', () => {
    expect(normalizeEmail(undefined)).toBeUndefined()
    expect(normalizeEmail(42)).toBe(42)
  })

  it('is applied by class-transformer via the decorator', () => {
    expect(plainToInstance(Body, { email: ' Bob@X.io ' }).email).toBe(
      'bob@x.io'
    )
    expect(plainToInstance(Body, {}).email).toBeUndefined()
  })
})

describe('email DTOs', () => {
  const dtos: Array<[string, new () => object, Record<string, unknown>]> = [
    ['SetupDto', SetupDto, {}],
    ['CreateInviteDto', CreateInviteDto, {}],
    ['AddMemberDto', AddMemberDto, {}],
    ['InviteRegisterDto', InviteRegisterDto, {}],
    ['RegisterDto', RegisterDto, {}],
    ['LoginDto', LoginDto, {}],
    ['ResendVerificationDto', ResendVerificationDto, {}],
    ['RequestPasswordResetDto', RequestPasswordResetDto, {}],
  ]

  it.each(dtos)('%s normalizes the email', (_name, Dto, extra) => {
    const dto = plainToInstance(Dto, { ...extra, email: ' Ada@Example.COM ' })
    expect((dto as { email: string }).email).toBe('ada@example.com')
  })
})
