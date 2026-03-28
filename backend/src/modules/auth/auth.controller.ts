import {
  Body,
  ConflictException,
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
import { ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import * as bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { AuthGuard } from '../../shared/auth.guard'
import { MailService } from '../../shared/mail.service'
import { PrismaService } from '../../shared/prisma.service'
import { AuthService } from './auth.service'
import { ChangePasswordDto } from './dto/change-password.dto'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { UpdateProfileDto } from './dto/update-profile.dto'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService
  ) {}

  @Post('login')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password)
  }

  @Post('register')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    const name = dto.name || `${dto.firstName} ${dto.lastName}`
    const result = await this.authService.register(
      dto.email,
      dto.password,
      name
    )

    // Send verification email
    const baseUrl = `${req.protocol}://${req.get('host')}`
    if (result.user.emailVerifyToken) {
      await this.mailService.sendVerificationEmail(
        dto.email,
        result.user.emailVerifyToken,
        baseUrl
      )
    }

    return result
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
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });

    return {
      user: {
        ...user,
        name: `${user.firstName} ${user.lastName}`,
        organizationId: membership?.organizationId,
        organization: membership?.organization,
      },
    };
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

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10)
    await this.prisma.user.update({
      where: { id: req.user.userId },
      data: { password: newPasswordHash },
    })

    return { success: true }
  }

  // Invite-based registration
  @Get('invite/:token')
  async getInviteInfo(@Param('token') token: string) {
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.expiresAt < new Date()) throw new NotFoundException('Invite expired');
    if (invite.acceptedAt) throw new ConflictException('Invite already used');

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });

    return {
      email: invite.email,
      organizationName: invite.organization.name,
      role: invite.role,
      existingUser: !!existingUser,
    };
  }

  // Accept invite for existing users
  @Post('invite/:token/accept')
  @UseGuards(AuthGuard)
  async acceptInvite(@Param('token') token: string, @Req() req: any) {
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { token },
      include: { organization: true },
    })

    if (!invite) throw new NotFoundException('Invite not found')
    if (invite.expiresAt < new Date())
      throw new NotFoundException('Invite expired')
    if (invite.acceptedAt) throw new ConflictException('Invite already used')

    // Verify the logged-in user matches the invite email
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
    })

    if (!user || user.email !== invite.email) {
      throw new ForbiddenException(
        'This invite is for a different email address'
      )
    }

    // Check if already a member
    const existingMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId: invite.organizationId, userId: user.id },
    })

    if (existingMember) {
      throw new ConflictException(
        'You are already a member of this organization'
      )
    }

    // Add user to organization
    await this.prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: invite.organizationId,
        role: invite.role,
      },
    })

    // Mark invite as accepted
    await this.prisma.organizationInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedById: user.id,
      },
    })

    return { success: true, message: 'You have joined the organization' }
  }

  @Post('invite/:token/register')
  async registerWithInvite(
    @Param('token') token: string,
    @Body() body: { password: string; firstName: string; lastName: string }
  ) {
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { token },
      include: { organization: true },
    })

    if (!invite) throw new NotFoundException('Invite not found')
    if (invite.expiresAt < new Date())
      throw new NotFoundException('Invite expired')
    if (invite.acceptedAt) throw new ConflictException('Invite already used')

    // Create user
    const registerResult = await this.authService.register(
      invite.email,
      body.password,
      `${body.firstName} ${body.lastName}`,
      body.firstName,
      body.lastName,
      false // email not verified yet
    )

    // Get the created user
    const newUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
    })

    if (!newUser) throw new NotFoundException('User creation failed')

    // Add user to organization
    await this.prisma.organizationMember.create({
      data: {
        userId: newUser.id,
        organizationId: invite.organizationId,
        role: invite.role,
      },
    })

    // Mark invite as accepted
    await this.prisma.organizationInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedById: newUser.id,
      },
    })

    return { success: true, message: 'Account created and joined organization' }
  }

  // Get pending invites for current user
  @Get('pending-invites')
  @UseGuards(AuthGuard)
  async getPendingInvites(@Req() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get all pending invites for this user's email
    const pendingInvites = await this.prisma.organizationInvite.findMany({
      where: {
        email: user.email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter out invites where user is already a member
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: req.user.userId },
      select: { organizationId: true },
    });
    const memberOrgIds = new Set(memberships.map(m => m.organizationId));

    const filteredInvites = pendingInvites.filter(
      invite => !memberOrgIds.has(invite.organizationId)
    );

    return {
      invites: filteredInvites.map(invite => ({
        id: invite.id,
        token: invite.token,
        organizationId: invite.organizationId,
        organizationName: invite.organization.name,
        role: invite.role,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
      })),
    };
  }

  // Email verification
  @Get('verify-email/:token')
  async verifyEmail(@Param('token') token: string) {
    const user = await this.prisma.user.findFirst({
      where: { emailVerifyToken: token },
    });

    if (!user) throw new NotFoundException('Invalid verification token');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
      },
    });

    return { success: true, message: 'Email verified successfully' };
  }

  @Post('resend-verification')
  async resendVerification(@Body() body: { email: string }, @Req() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
    })

    if (!user) throw new NotFoundException('User not found')
    if (user.emailVerified)
      throw new ConflictException('Email already verified')

    // Generate new token
    const token = randomUUID()
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: token },
    })

    // Send verification email
    const baseUrl = `${req.protocol}://${req.get('host')}`
    await this.mailService.sendVerificationEmail(body.email, token, baseUrl)

    return { success: true, message: 'Verification email sent' }
  }
}
