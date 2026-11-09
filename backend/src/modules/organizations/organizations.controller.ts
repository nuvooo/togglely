import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrganizationRole } from '@prisma/client'
import { randomUUID } from 'crypto'
import { AccessService, isObjectId } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { MailService } from '../../shared/mail.service'
import { PrismaService } from '../../shared/prisma.service'
import {
  AddMemberDto,
  CreateInviteDto,
  CreateOrganizationDto,
  UpdateMemberRoleDto,
  UpdateOrganizationDto,
} from './dto/organization.dto'
import { OrganizationsService } from './organizations.service'

/** Roles that only an OWNER may grant, revoke or manage. */
const PRIVILEGED_ROLES: ReadonlySet<OrganizationRole> =
  new Set<OrganizationRole>(['OWNER', 'ADMIN'])

/**
 * Throws unless `actorRole` may hand out `role` to someone else.
 * ADMINs may only grant MEMBER/VIEWER; only OWNERs may grant ADMIN/OWNER.
 */
export function assertCanGrantRole(
  actorRole: OrganizationRole,
  role: OrganizationRole
) {
  if (PRIVILEGED_ROLES.has(role) && actorRole !== 'OWNER') {
    throw new ForbiddenException(
      'Only owners can grant the ADMIN or OWNER role'
    )
  }
}

function assertObjectIdParam(id: string, label = 'Member') {
  if (!isObjectId(id)) throw new NotFoundException(`${label} not found`)
}

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(
    private readonly orgsService: OrganizationsService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly access: AccessService
  ) {}

  @Get()
  async findAll(@Req() req: any) {
    const orgs = await this.orgsService.findAll(req.user.userId)
    return { organizations: orgs }
  }

  @Get('stats')
  async getStats(@Req() req: any) {
    const stats = await this.orgsService.getStats(req.user.userId)
    return stats
  }

  @Get('my')
  async getMyOrg(@Req() req: any) {
    const org = await this.orgsService.findByUser(req.user.userId)
    return { organization: org }
  }

  @Post()
  async create(@Body() body: CreateOrganizationDto, @Req() req: any) {
    const org = await this.orgsService.create(
      body.name,
      body.slug,
      req.user.userId
    )
    return { organization: org }
  }

  // Members - Define BEFORE the generic :id route to avoid shadowing
  @Get(':id/members')
  async getMembers(@Param('id') id: string, @Req() req: any) {
    await this.access.assertOrgRole(req.user.userId, id, 'VIEWER')
    const members = await this.orgsService.getMembers(id)
    return { members }
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() body: AddMemberDto,
    @Req() req: any
  ) {
    const actor = await this.access.assertOrgRole(req.user.userId, id, 'ADMIN')
    const role = body.role ?? 'MEMBER'
    assertCanGrantRole(actor.role, role)

    const member = await this.orgsService.addMember(id, body.email, role)
    return { member }
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: any
  ) {
    assertObjectIdParam(userId)
    const actorId: string = req.user.userId
    const isSelf = actorId === userId

    // Any member may leave; removing others requires ADMIN+.
    const actor = await this.access.assertOrgRole(
      actorId,
      id,
      isSelf ? 'VIEWER' : 'ADMIN'
    )

    const target = isSelf ? actor : await this.orgsService.getMember(id, userId)
    if (!target) throw new NotFoundException('Member not found in organization')

    if (
      !isSelf &&
      PRIVILEGED_ROLES.has(target.role) &&
      actor.role !== 'OWNER'
    ) {
      throw new ForbiddenException('Only owners can remove admins or owners')
    }

    if (target.role === 'OWNER') {
      const owners = await this.orgsService.countOwners(id)
      if (owners <= 1) {
        throw new BadRequestException(
          'Cannot remove the last owner of the organization'
        )
      }
    }

    await this.orgsService.removeMember(id, userId)
    return { success: true }
  }

  // Invites
  @Post(':id/invites')
  async createInvite(
    @Param('id') id: string,
    @Body() body: CreateInviteDto,
    @Req() req: any
  ) {
    const actor = await this.access.assertOrgRole(req.user.userId, id, 'ADMIN')
    const role = body.role ?? 'MEMBER'
    assertCanGrantRole(actor.role, role)

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: body.email },
    })

    // Check if already a member
    if (existingUser) {
      const existingMember = await this.prisma.organizationMember.findFirst({
        where: { organizationId: id, userId: existingUser.id },
      })

      if (existingMember) {
        throw new ForbiddenException('User is already a member')
      }
    }

    // Check for existing pending invite
    const existingInvite = await this.prisma.organizationInvite.findFirst({
      where: {
        email: body.email,
        organizationId: id,
        acceptedAt: null,
      },
    })

    if (existingInvite) {
      throw new ForbiddenException(
        'An invite is already pending for this email'
      )
    }

    // Create invite token
    const token = randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

    await this.prisma.organizationInvite.create({
      data: {
        email: body.email,
        organizationId: id,
        role,
        token,
        expiresAt,
      },
    })

    // Get organization name
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: { name: true },
    })

    // Send invite email
    const baseUrl = this.config.get('FRONTEND_URL') || 'https://togglely.de'
    await this.mailService.sendInviteEmail(
      body.email,
      token,
      organization?.name || 'Organization',
      baseUrl
    )

    // The invite link is only returned to admins/owners (checked above) so
    // they can share it manually if the email does not arrive.
    return {
      success: true,
      inviteUrl: `/invite/${token}`,
      message: 'Invite created and email sent.',
    }
  }

  @Get(':id/invites')
  async getInvites(@Param('id') id: string, @Req() req: any) {
    await this.access.assertOrgRole(req.user.userId, id, 'ADMIN')

    const invites = await this.prisma.organizationInvite.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: 'desc' },
    })

    return { invites }
  }

  @Delete(':id/invites/:inviteId')
  async cancelInvite(
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
    @Req() req: any
  ) {
    await this.access.assertOrgRole(req.user.userId, id, 'ADMIN')
    assertObjectIdParam(inviteId, 'Invite')

    const result = await this.prisma.organizationInvite.deleteMany({
      where: { id: inviteId, organizationId: id },
    })
    if (result.count === 0) throw new NotFoundException('Invite not found')

    return { success: true }
  }

  // Update member role
  @Patch(':id/members/:userId')
  async updateMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: UpdateMemberRoleDto,
    @Req() req: any
  ) {
    assertObjectIdParam(userId)
    const actor = await this.access.assertOrgRole(req.user.userId, id, 'ADMIN')

    if (req.user.userId === userId) {
      throw new ForbiddenException('You cannot change your own role')
    }

    const targetMember = await this.orgsService.getMember(id, userId)
    if (!targetMember) {
      throw new NotFoundException('Member not found')
    }

    // Only owners may touch privileged roles (either side of the change).
    if (
      actor.role !== 'OWNER' &&
      (PRIVILEGED_ROLES.has(targetMember.role) ||
        PRIVILEGED_ROLES.has(body.role))
    ) {
      throw new ForbiddenException(
        'Only owners can grant or revoke the ADMIN or OWNER role'
      )
    }

    if (targetMember.role === 'OWNER' && body.role !== 'OWNER') {
      const owners = await this.orgsService.countOwners(id)
      if (owners <= 1) {
        throw new BadRequestException(
          'Cannot demote the last owner of the organization'
        )
      }
    }

    const member = await this.orgsService.updateMemberRole(
      targetMember.id,
      body.role
    )
    return { member }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    await this.access.assertOrgRole(req.user.userId, id, 'VIEWER')
    const org = await this.orgsService.findOne(id)
    return { organization: org }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateOrganizationDto,
    @Req() req: any
  ) {
    await this.access.assertOrgRole(req.user.userId, id, 'ADMIN')
    const data: { name?: string; description?: string } = {}
    if (body.name !== undefined) data.name = body.name
    if (body.description !== undefined) data.description = body.description
    const org = await this.orgsService.update(id, data)
    return { organization: org }
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.access.assertOrgRole(req.user.userId, id, 'OWNER')
    await this.orgsService.delete(id)
    return { success: true }
  }
}
