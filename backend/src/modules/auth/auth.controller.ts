import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { AuthGuard } from '../../shared/auth.guard'
import { MailService } from '../../shared/mail.service'
import { PrismaService } from '../../shared/prisma.service'
import { findUserByEmail } from '../../shared/users'
import { BCRYPT_ROUNDS, hashToken } from '../../shared/utils'
import { AuthService } from './auth.service'
import { ChangePasswordDto } from './dto/change-password.dto'
import { InviteRegisterDto } from './dto/invite-register.dto'
import { LoginDto } from './dto/login.dto'
import { ResendVerificationDto } from './dto/resend-verification.dto'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { InvitesService } from './invites.service'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly invites: InvitesService
  ) {}

  /**
   * Links in emails always point to the configured frontend. Never derive
   * them from the request Host header, which an attacker controls.
   */
  private get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'
  }

  @Post('login')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password)
  }

  /**
   * Open registration is closed: new users join via invite links, the
   * first user via the instance setup (POST /setup).
   */
  @Post('register')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async register(): Promise<never> {
    if ((await this.prisma.user.count()) === 0) {
      throw new ForbiddenException(
        'Registration is invite-only. Set up this instance at /setup first.'
      )
    }
    throw new ForbiddenException('Registration is invite-only')
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getProfile(@Req() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    })

    return {
      user: {
        ...user,
        name: `${user.firstName} ${user.lastName}`,
        organizationId: membership?.organizationId,
        organization: membership?.organization,
      },
    }
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: req.user.userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    })

    return {
      user: {
        ...user,
        name: `${user.firstName} ${user.lastName}`,
      },
    }
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password)
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect')
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS)
    // Setting passwordChangedAt revokes all previously issued sessions
    await this.prisma.user.update({
      where: { id: req.user.userId },
      data: { password: newPasswordHash, passwordChangedAt: new Date() },
    })

    // Hand the current client a fresh token so it stays logged in
    const token = await this.authService.issueToken(user)
    return { success: true, token }
  }

  // Invite links (logic in InvitesService)
  @Get('invite/:token')
  async getInviteInfo(@Param('token') token: string) {
    return this.invites.getInfo(token)
  }

  /** Joins the invite's organization as the logged-in user. */
  @Post('invite/:token/accept')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 900000, limit: 20 } })
  async acceptInvite(@Param('token') token: string, @Req() req: any) {
    return this.invites.accept(token, req.user.userId)
  }

  /** Creates an account via an invite link; the response logs the user in and names the joined organization. */
  @Post('invite/:token/register')
  @Throttle({ default: { ttl: 900000, limit: 10 } })
  async registerWithInvite(
    @Param('token') token: string,
    @Body() body: InviteRegisterDto
  ) {
    return this.invites.register(token, body)
  }

  // Bound invites addressed to the current user's verified email
  @Get('pending-invites')
  @UseGuards(AuthGuard)
  async getPendingInvites(@Req() req: any) {
    return this.invites.getPendingForUser(req.user.userId)
  }

  /** Accepts a pending (email-bound) invite by id, no link token needed. */
  @Post('pending-invites/:inviteId/accept')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 900000, limit: 20 } })
  async acceptPendingInvite(
    @Param('inviteId') inviteId: string,
    @Req() req: any
  ) {
    return this.invites.acceptPending(inviteId, req.user.userId)
  }

  // Email verification
  @Get('verify-email/:token')
  async verifyEmail(@Param('token') token: string) {
    const user = await this.prisma.user.findFirst({
      // Tokens are stored hashed; plain lookup supports links sent before
      // hashing was introduced.
      where: {
        OR: [
          { emailVerifyToken: hashToken(token) },
          { emailVerifyToken: token },
        ],
      },
    })

    if (!user) throw new NotFoundException('Invalid verification token')

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
      },
    })

    return { success: true, message: 'Email verified successfully' }
  }

  @Post('resend-verification')
  @Throttle({ default: { ttl: 900000, limit: 3 } })
  async resendVerification(@Body() body: ResendVerificationDto) {
    const user = await findUserByEmail(this.prisma, body.email)

    // Same response whether or not the account exists (no user enumeration).
    // Without SMTP there is nothing to send, so the token is left untouched.
    if (user && !user.emailVerified && this.mailService.isEnabled()) {
      const token = randomBytes(32).toString('hex')
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifyToken: hashToken(token) },
      })

      await this.mailService.sendVerificationEmail(
        user.email,
        token,
        this.frontendUrl
      )
    }

    return {
      success: true,
      message: 'If the account exists and is unverified, an email was sent',
    }
  }
}
