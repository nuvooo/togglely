import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../../shared/auth.guard';
import { PrismaService } from '../../shared/prisma.service';
import { MailService } from '../../shared/mail.service';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(
    private readonly orgsService: OrganizationsService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @Get()
  async findAll(@Req() req: any) {
    const orgs = await this.orgsService.findAll(req.user.userId);
    return { organizations: orgs };
  }

  @Get('stats')
  async getStats(@Req() req: any) {
    const stats = await this.orgsService.getStats(req.user.userId);
    return stats;
  }

  @Get('my')
  async getMyOrg(@Req() req: any) {
    const org = await this.orgsService.findByUser(req.user.userId);
    return { organization: org };
  }

  @Post()
  async create(@Body() body: { name: string; slug?: string }, @Req() req: any) {
    const org = await this.orgsService.create(body.name, body.slug, req.user.userId);
    return { organization: org };
  }

  // Members - Define BEFORE the generic :id route to avoid shadowing
  @Get(':id/members')
  async getMembers(@Param('id') id: string) {
    const members = await this.orgsService.getMembers(id);
    return { members };
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() body: { email: string; role?: string },
  ) {
    const member = await this.orgsService.addMember(id, body.email, body.role || 'MEMBER');
    return { member };
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.orgsService.removeMember(id, userId);
    return { success: true };
  }

  // Invites
  @Post(':id/invites')
  async createInvite(
    @Param('id') id: string,
    @Body() body: { email: string; role?: string },
    @Req() req: any,
  ) {
    // Check permissions
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId: req.user.userId,
        organizationId: id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Only owners and admins can invite members');
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: body.email },
    });

    // Check if already a member
    if (existingUser) {
      const existingMember = await this.prisma.organizationMember.findFirst({
        where: { organizationId: id, userId: existingUser.id },
      });

      if (existingMember) {
        throw new ForbiddenException('User is already a member');
      }
    }

    // Check for existing pending invite
    const existingInvite = await this.prisma.organizationInvite.findFirst({
      where: {
        email: body.email,
        organizationId: id,
        acceptedAt: null,
      },
    });

    if (existingInvite) {
      throw new ForbiddenException('An invite is already pending for this email');
    }

    // Create invite token
    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const invite = await this.prisma.organizationInvite.create({
      data: {
        email: body.email,
        organizationId: id,
        role: (body.role || 'MEMBER') as any,
        token,
        expiresAt,
      },
    });

    // Get organization name
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: { name: true },
    });

    // Send invite email
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await this.mailService.sendInviteEmail(
      body.email,
      token,
      organization?.name || 'Organization',
      baseUrl
    );

    return {
      success: true,
      inviteToken: token,
      inviteUrl: `/invite/${token}`,
      message: 'Invite created and email sent.',
    };
  }

  @Get(':id/invites')
  async getInvites(@Param('id') id: string, @Req() req: any) {
    // Check permissions
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId: req.user.userId,
        organizationId: id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Only owners and admins can view invites');
    }

    const invites = await this.prisma.organizationInvite.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: 'desc' },
    });

    return { invites };
  }

  @Delete(':id/invites/:inviteId')
  async cancelInvite(
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
    @Req() req: any,
  ) {
    // Check permissions
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId: req.user.userId,
        organizationId: id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Only owners and admins can cancel invites');
    }

    await this.prisma.organizationInvite.delete({
      where: { id: inviteId, organizationId: id },
    });

    return { success: true };
  }

  // Update member role
  @Patch(':id/members/:userId')
  async updateMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { role: string },
    @Req() req: any,
  ) {
    // Check permissions (only OWNER can change roles, ADMIN cannot change OWNER)
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId: req.user.userId,
        organizationId: id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Only owners and admins can update member roles');
    }

    // Get target member
    const targetMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId: id, userId },
    });

    if (!targetMember) {
      throw new ForbiddenException('Member not found');
    }

    // ADMIN cannot change OWNER's role
    if (membership.role === 'ADMIN' && targetMember.role === 'OWNER') {
      throw new ForbiddenException('Admins cannot modify the owner');
    }

    // Cannot change owner's role (only owner can transfer ownership)
    if (targetMember.role === 'OWNER' && body.role !== 'OWNER') {
      throw new ForbiddenException('Cannot change owner role. Transfer ownership instead.');
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: targetMember.id },
      data: { role: body.role as any },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    return {
      member: {
        id: updated.id,
        userId: updated.userId,
        email: updated.user.email,
        firstName: updated.user.firstName,
        lastName: updated.user.lastName,
        name: `${updated.user.firstName ?? ''} ${updated.user.lastName ?? ''}`.trim() || updated.user.email,
        role: updated.role,
      },
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const org = await this.orgsService.findOne(id);
    return { organization: org };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    const org = await this.orgsService.update(id, body);
    return { organization: org };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.orgsService.delete(id);
    return { success: true };
  }
}
