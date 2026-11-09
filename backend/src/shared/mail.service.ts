import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MailerService } from '@nestjs-modules/mailer'
import { escapeHtml } from './utils'

/** True when an SMTP server is configured (SMTP_HOST set). */
export function isMailEnabled(config: ConfigService): boolean {
  return !!config.get<string>('SMTP_HOST')
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  constructor(
    private readonly mailerService: MailerService,
    private readonly config: ConfigService
  ) {}

  /** Mail is only sent when an SMTP server is configured. */
  isEnabled(): boolean {
    return isMailEnabled(this.config)
  }

  /** Returns false (and skips sending) when SMTP is not configured. */
  private skipWithoutSmtp(kind: string): boolean {
    if (this.isEnabled()) return false
    this.logger.debug(`SMTP not configured, skipping ${kind} email`)
    return true
  }

  async sendVerificationEmail(email: string, token: string, baseUrl: string) {
    if (this.skipWithoutSmtp('verification')) return false
    const verificationUrl = `${baseUrl}/verify-email/${token}`

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Verify your email - Togglely',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4F46E5;">Welcome to Togglely!</h2>
            <p>Please verify your email address by clicking the button below:</p>
            <a href="${verificationUrl}" 
               style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; margin: 20px 0;">
              Verify Email
            </a>
            <p>Or copy this link to your browser:</p>
            <p style="word-break: break-all; color: #6B7280;">${verificationUrl}</p>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
            <p style="color: #9CA3AF; font-size: 12px;">
              If you didn't create an account, you can safely ignore this email.
            </p>
          </div>
        `,
        text: `Welcome to Togglely! Please verify your email by visiting: ${verificationUrl}`,
      })

      this.logger.log(`Verification email sent`)
      return true
    } catch (error) {
      this.logger.error(`Failed to send verification email:`, error)
      return false
    }
  }

  async sendInviteEmail(
    email: string,
    token: string,
    organizationName: string,
    baseUrl: string
  ) {
    if (this.skipWithoutSmtp('invite')) return false
    const inviteUrl = `${baseUrl}/invite/${token}`
    const safeOrganizationName = escapeHtml(organizationName)

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `You've been invited to join ${organizationName.replace(/[\r\n]+/g, ' ')} on Togglely`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4F46E5;">You're Invited!</h2>
            <p>You've been invited to join <strong>${safeOrganizationName}</strong> on Togglely.</p>
            <p>Click the button below to create your account and join the organization:</p>
            <a href="${inviteUrl}" 
               style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; margin: 20px 0;">
              Accept Invite
            </a>
            <p>Or copy this link to your browser:</p>
            <p style="word-break: break-all; color: #6B7280;">${inviteUrl}</p>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
            <p style="color: #9CA3AF; font-size: 12px;">
              This invite will expire in 7 days. If you don't know this organization, you can ignore this email.
            </p>
          </div>
        `,
        text: `You've been invited to join ${organizationName} on Togglely. Visit: ${inviteUrl}`,
      })

      this.logger.log(`Invite email sent`)
      return true
    } catch (error) {
      this.logger.error(`Failed to send invite email:`, error)
      return false
    }
  }

  async sendPasswordResetEmail(email: string, token: string, baseUrl: string) {
    if (this.skipWithoutSmtp('password reset')) return false
    const resetUrl = `${baseUrl}/reset-password?token=${token}`

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset - Togglely',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4F46E5;">Password Reset</h2>
            <p>You requested a password reset for your Togglely account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" 
               style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; margin: 20px 0;">
              Reset Password
            </a>
            <p>Or copy this link to your browser:</p>
            <p style="word-break: break-all; color: #6B7280;">${resetUrl}</p>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
            <p style="color: #9CA3AF; font-size: 12px;">
              This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
        text: `Reset your Togglely password: ${resetUrl}`,
      })

      this.logger.log(`Password reset email sent`)
      return true
    } catch (error) {
      this.logger.error(`Failed to send password reset email:`, error)
      return false
    }
  }
}
