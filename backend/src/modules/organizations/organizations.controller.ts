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
import { AccessService, isObjectId } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import {
  AddMemberDto,
  CreateInviteDto,
  CreateOrganizationDto,
  UpdateMemberRoleDto,
  UpdateOrganizationDto,
} from './dto/organization.dto'
import { OrganizationInvitesService } from './organization-invites.service'
import { OrganizationsService } from './organizations.service'
import { assertCanGrantRole, PRIVILEGED_ROLES } from './roles'

export { assertCanGrantRole } from './roles'

function assertObjectIdParam(id: string, label = 'Member') {
  if (!isObjectId(id)) throw new NotFoundException(`${label} not found`)
}

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(
    private readonly orgsService: OrganizationsService,
    private readonly access: AccessService,
    private readonly invites: OrganizationInvitesService
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

  // Invites (ADMIN+). The plain invite link is only returned on creation.
  @Post(':id/invites')
  async createInvite(
    @Param('id') id: string,
    @Body() body: CreateInviteDto,
    @Req() req: any
  ) {
    const actor = await this.access.assertOrgRole(req.user.userId, id, 'ADMIN')
    return this.invites.create(
      id,
      { userId: req.user.userId, role: actor.role },
      body
    )
  }

  @Get(':id/invites')
  async getInvites(@Param('id') id: string, @Req() req: any) {
    await this.access.assertOrgRole(req.user.userId, id, 'ADMIN')
    return { invites: await this.invites.list(id) }
  }

  /** Revokes the invite (kept for the audit trail instead of deleting). */
  @Delete(':id/invites/:inviteId')
  async cancelInvite(
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
    @Req() req: any
  ) {
    await this.access.assertOrgRole(req.user.userId, id, 'ADMIN')
    await this.invites.revoke(id, inviteId, req.user.userId)
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
