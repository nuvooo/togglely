import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'
import { PrismaService } from '../../shared/prisma.service'
import { findUserByEmail } from '../../shared/users'
import { BCRYPT_ROUNDS, hashToken } from '../../shared/utils'
import { MailService } from '../mail/mail.service'

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService
  ) {}

  async requestReset(email: string) {
    const user = await findUserByEmail(this.prisma, email)
    if (!user) {
      return
    }

    const { token } = await this.issueToken(user.id)

    this.logger.debug(`Password reset requested for user ${user.id}`)

    try {
      const sent = await this.mailService.sendPasswordResetEmail(
        user.email,
        token
      )
      if (!sent) {
        // The client still gets the generic response (no account leak)
        this.logger.warn(
          `Password reset for user ${user.id} not emailed: SMTP is not configured`
        )
      }
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email for user ${user.id}`
      )
    }
  }

  /**
   * Creates a reset link without sending mail (admin UI / server CLI).
   * The caller is responsible for authorization. A new link invalidates any
   * previously issued one, since only the latest token hash is stored.
   */
  async createResetLink(
    userId: string
  ): Promise<{ resetUrl: string; expiresAt: Date }> {
    const { token, expiresAt } = await this.issueToken(userId)
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000'
    )
    return {
      resetUrl: `${frontendUrl}/reset-password?token=${token}`,
      expiresAt,
    }
  }

  /** Generates a token, stores only its hash and returns the plain token. */
  private async issueToken(userId: string) {
    const token = crypto.randomBytes(32).toString('hex')
    const expiryHours =
      Number(this.config.get('RESET_TOKEN_EXPIRY_HOURS', 1)) || 1
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        resetToken: hashToken(token),
        resetTokenExpiry: expiresAt,
      },
    })
    return { token, expiresAt }
  }

  /** Matches an unexpired token of an active user. */
  private tokenWhere(token: string) {
    return {
      resetToken: hashToken(token),
      resetTokenExpiry: { gt: new Date() },
      isActive: true,
    }
  }

  private findUserByToken(token: string) {
    return this.prisma.user.findFirst({
      where: this.tokenWhere(token),
      select: { id: true },
    })
  }

  async isTokenValid(token: string): Promise<boolean> {
    return !!(await this.findUserByToken(token))
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.findUserByToken(token)

    if (!user) {
      throw new NotFoundException('Invalid or expired token')
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    // Consumes the token atomically: the update only matches while the token
    // is still stored, so of two concurrent submits only one succeeds.
    // passwordChangedAt revokes all existing sessions of this user.
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, ...this.tokenWhere(token) },
      data: {
        password: passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        passwordChangedAt: new Date(),
      },
    })
    if (count !== 1) {
      throw new NotFoundException('Invalid or expired token')
    }
  }
}
