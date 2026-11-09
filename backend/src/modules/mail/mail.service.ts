import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MailerService } from '@nestjs-modules/mailer'
import { isMailEnabled } from '../../shared/mail.service'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService
  ) {}

  /** Mail is only sent when an SMTP server is configured. */
  isEnabled(): boolean {
    return isMailEnabled(this.configService)
  }

  /** Returns false without sending when SMTP is not configured. */
  async sendPasswordResetEmail(email: string, token: string) {
    if (!this.isEnabled()) {
      this.logger.debug('SMTP not configured, skipping password reset email')
      return false
    }

    const frontendUrl = this.configService.get(
      'FRONTEND_URL',
      'http://localhost:3000'
    )
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`

    await this.mailerService.sendMail({
      to: email,
      subject: 'Reset your Togglely password',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #6366f1;">Reset Your Password</h2>
          <p>You requested to reset your password for your Togglely account. Click the button below to set a new password:</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${resetUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
          </div>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #666;">Togglely Feature Flags - Powerful and simple.</p>
        </div>
      `,
    })
    return true
  }
}
