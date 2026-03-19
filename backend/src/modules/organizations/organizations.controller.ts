import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../../shared/auth.guard';
import { PrismaService } from '../../shared/prisma.service';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(
    private readonly orgsService: OrganizationsService,
    private readonly prisma: PrismaService,
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

    if (existingUser) {
      // Add existing user directly
      const existingMember = await this.prisma.organizationMember.findFirst({
        where: { organizationId: id, userId: existingUser.id },
      });

      if (existingMember) {
        throw new ForbiddenException('User is already a member');
      }

      await this.prisma.organizationMember.create({
        data: {
          userId: existingUser.id,
          organizationId: id,
          role: (body.role || 'MEMBER') as any,
        },
      });

      return { success: true, message: 'User added to organization' };
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

    // TODO: Send email with invite link
    // For now, return the token
    return {
      success: true,
      inviteToken: token,
      inviteUrl: `/invite/${token}`,
      message: 'Invite created. Send the invite URL to the user.',
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
