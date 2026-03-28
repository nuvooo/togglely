import { Body, Controller, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { PasswordResetService } from './password-reset.service'

@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly service: PasswordResetService) {}

  @Post('request')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async request(@Body() body: { email: string }) {
    await this.service.requestReset(body.email);
    return { success: true };
  }

  @Post('verify')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async verify(@Body() body: { token: string; newPassword: string }) {
    await this.service.resetPassword(body.token, body.newPassword);
    return { success: true };
  }
}
