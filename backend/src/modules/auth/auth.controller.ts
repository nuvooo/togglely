import { Controller, Post, Get, Patch, Body, Param, Req, UseGuards, NotFoundException, ConflictException } from '@nestjs/common';
import { ApiTags, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthGuard } from '../../shared/auth.guard';
import { PrismaService } from '../../shared/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('register')
  async register(@Body() body: { email: string; password: string; name: string; firstName?: string; lastName?: string }) {
    // Support both name and firstName/lastName
    const name = body.name || `${body.firstName} ${body.lastName}`;
    return this.authService.register(body.email, body.password, name);
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
      return { error: 'User not found' };
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
    });

    return {
      user: {
        ...user,
        name: `${user.firstName} ${user.lastName}`,
      },
    };
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  async changePassword(
    @Req() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user) {
      return { error: 'User not found' };
    }

    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) {
      return { error: 'Current password is incorrect' };
    }

    const newPasswordHash = await bcrypt.hash(body.newPassword, 10);
    await this.prisma.user.update({
      where: { id: req.user.userId },
      data: { password: newPasswordHash },
    });

    return { success: true };
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

    return {
      email: invite.email,
      organizationName: invite.organization.name,
      role: invite.role,
    };
  }

  @Post('invite/:token/register')
  async registerWithInvite(
    @Param('token') token: string,
    @Body() body: { password: string; firstName: string; lastName: string },
  ) {
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.expiresAt < new Date()) throw new NotFoundException('Invite expired');
    if (invite.acceptedAt) throw new ConflictException('Invite already used');

    // Create user
    const registerResult = await this.authService.register(
      invite.email,
      body.password,
      `${body.firstName} ${body.lastName}`,
      body.firstName,
      body.lastName,
      false // email not verified yet
    );

    // Get the created user
    const newUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (!newUser) throw new NotFoundException('User creation failed');

    // Add user to organization
    await this.prisma.organizationMember.create({
      data: {
        userId: newUser.id,
        organizationId: invite.organizationId,
        role: invite.role,
      },
    });

    // Mark invite as accepted
    await this.prisma.organizationInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedById: newUser.id,
      },
    });

    return { success: true, message: 'Account created and joined organization' };
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
  async resendVerification(@Body() body: { email: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) throw new ConflictException('Email already verified');

    // Generate new token
    const token = randomUUID();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: token },
    });

    // TODO: Send email with verification link
    // For now, just return the token (in production, send via email)
    return { success: true, message: 'Verification email sent' };
  }
}
