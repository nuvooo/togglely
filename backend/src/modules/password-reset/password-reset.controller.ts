import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import {
  LegacyResetPasswordDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  ValidateResetTokenDto,
} from './dto/password-reset.dto'
import { PasswordResetService } from './password-reset.service'

@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly service: PasswordResetService) {}

  @Post('request')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async request(@Body() body: RequestPasswordResetDto) {
    await this.service.requestReset(body.email)
    return { success: true }
  }

  @Get('validate')
  @Throttle({ default: { ttl: 900000, limit: 20 } })
  async validate(@Query() query: ValidateResetTokenDto) {
    return { valid: await this.service.isTokenValid(query.token) }
  }

  @Post('reset')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async reset(@Body() body: ResetPasswordDto) {
    await this.service.resetPassword(body.token, body.password)
    return { success: true }
  }

  /** @deprecated use POST /password-reset/reset */
  @Post('verify')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async verify(@Body() body: LegacyResetPasswordDto) {
    await this.service.resetPassword(body.token, body.newPassword)
    return { success: true }
  }
}
