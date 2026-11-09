import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'
import { PrismaService } from '../../shared/prisma.service'
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
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) {
      return
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiryHours = this.config.get<number>('RESET_TOKEN_EXPIRY_HOURS', 1)
    const expires = new Date()
    expires.setHours(expires.getHours() + expiryHours)

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashToken(token),
        resetTokenExpiry: expires,
      },
    })

    this.logger.debug(`Password reset requested for user ${user.id}`)

    try {
      await this.mailService.sendPasswordResetEmail(email, token)
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email for user ${user.id}`
      )
    }
  }

  private findUserByToken(token: string) {
    return this.prisma.user.findFirst({
      where: {
        resetToken: hashToken(token),
        resetTokenExpiry: { gt: new Date() },
      },
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
    // passwordChangedAt revokes all existing sessions of this user
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        passwordChangedAt: new Date(),
      },
    })
  }
}
