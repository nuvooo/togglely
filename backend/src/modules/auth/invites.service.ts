import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Organization, OrganizationInvite } from '@prisma/client'
import { isObjectId } from '../../shared/access/access.service'
import { openInviteWhere } from '../../shared/invites'
import { MailService } from '../../shared/mail.service'
import { PrismaService } from '../../shared/prisma.service'
import { hashToken } from '../../shared/utils'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { AuthService } from './auth.service'
import { InviteRegisterDto } from './dto/invite-register.dto'

type InviteWithOrg = OrganizationInvite & {
  organization: Pick<Organization, 'id' | 'name'>
}

/** Tokens are 64 hex chars (legacy: UUIDs); anything much longer is bogus. */
const MAX_TOKEN_LENGTH = 200

const sameEmail = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Using invite links: lookup, registration via link and joining an
 * organization as an existing user.
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly mailService: MailService,
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService
  ) {}

  private get frontendUrl(): string {
    const url =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    return url.replace(/\/+$/, '')
  }

  /**
   * Resolves a token to a usable invite. Looks up the token hash first and
   * falls back to the plain `token` field of invites created before tokens
   * were hashed.
   */
  async findValidInvite(token: string): Promise<InviteWithOrg> {
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      throw new NotFoundException('Invite not found')
    }

    const include = { organization: { select: { id: true, name: true } } }
    const invite =
      (await this.prisma.organizationInvite.findFirst({
        where: { tokenHash: hashToken(token) },
        include,
      })) ??
      (await this.prisma.organizationInvite.findFirst({
        where: { token },
        include,
      }))

    return this.assertUsable(invite)
  }

  private assertUsable(invite: InviteWithOrg | null): InviteWithOrg {
    if (!invite || invite.revokedAt) {
      throw new NotFoundException('Invite not found')
    }
    if (invite.acceptedAt) throw new ConflictException('Invite already used')
    if (invite.expiresAt <= new Date()) {
      throw new NotFoundException('Invite expired')
    }
    return invite
  }

  async getInfo(token: string) {
    const invite = await this.findValidInvite(token)
    const existingUser = invite.email
      ? !!(await this.prisma.user.findUnique({
          where: { email: invite.email },
          select: { id: true },
        }))
      : false

    return {
      organizationName: invite.organization.name,
      role: invite.role,
      email: invite.email ?? null,
      existingUser,
    }
  }

  /** Creates an account via an invite link and joins the organization. */
  async register(token: string, body: InviteRegisterDto) {
    const invite = await this.findValidInvite(token)

    // A bound invite proves the address (the link was sent to it); an open
    // link proves nothing about the address the user types in.
    const bound = !!invite.email
    const email = invite.email || body.email?.trim()
    if (!email) throw new BadRequestException('Email is required')

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists. Please log in and accept the invite.'
      )
    }

    await this.claim(invite)

    let registered: Awaited<ReturnType<AuthService['register']>>
    try {
      registered = await this.authService.register(
        email,
        body.password,
        `${body.firstName} ${body.lastName}`.trim(),
        body.firstName,
        body.lastName,
        bound
      )
    } catch (error) {
      await this.release(invite.id)
      throw error
    }

    const { emailVerifyToken, user } = registered
    await this.join(invite, user.id)

    if (emailVerifyToken && this.mailService.isEnabled()) {
      await this.mailService.sendVerificationEmail(
        email,
        emailVerifyToken,
        this.frontendUrl
      )
    }

    const sessionToken = await this.authService.issueToken(user)
    return { token: sessionToken, user }
  }

  /** Joins the organization of an invite link as the logged-in user. */
  async accept(token: string, userId: string) {
    const invite = await this.findValidInvite(token)
    return this.acceptAsUser(invite, userId)
  }

  /**
   * Accepts a bound invite listed in the user's pending invites (by id).
   * Only invites addressed to the user's verified email qualify; open links
   * must be used via their token.
   */
  async acceptPending(inviteId: string, userId: string) {
    if (!isObjectId(inviteId)) throw new NotFoundException('Invite not found')

    const [invite, user] = await Promise.all([
      this.prisma.organizationInvite.findUnique({
        where: { id: inviteId },
        include: { organization: { select: { id: true, name: true } } },
      }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ])
    if (!invite?.email || !user || !sameEmail(user.email, invite.email)) {
      throw new NotFoundException('Invite not found')
    }

    return this.acceptAsUser(this.assertUsable(invite), userId)
  }

  /** Bound invites of the user's verified email that are still open. */
  async getPendingForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    })
    if (!user) throw new NotFoundException('User not found')

    // Invites are only shown to verified addresses
    if (!user.emailVerified) {
      return { invites: [], emailVerificationRequired: true }
    }

    const [pending, memberships] = await Promise.all([
      this.prisma.organizationInvite.findMany({
        where: {
          email: user.email,
          expiresAt: { gt: new Date() },
          ...openInviteWhere(),
        },
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organizationMember.findMany({
        where: { userId },
        select: { organizationId: true },
      }),
    ])
    const memberOrgIds = new Set(memberships.map((m) => m.organizationId))

    return {
      invites: pending
        .filter((invite) => !memberOrgIds.has(invite.organizationId))
        .map((invite) => ({
          id: invite.id,
          // Only legacy invites still have a plain token
          token: invite.token ?? null,
          organizationId: invite.organizationId,
          organizationName: invite.organization.name,
          role: invite.role,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
        })),
    }
  }

  private async acceptAsUser(invite: InviteWithOrg, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')

    if (invite.email) {
      if (!sameEmail(user.email, invite.email)) {
        throw new ForbiddenException(
          'This invite is for a different email address'
        )
      }
      // Without a verified email, anyone could have registered the invitee's
      // address earlier and take over the invite.
      if (!user.emailVerified) {
        throw new ForbiddenException(
          'Please verify your email address before accepting invites'
        )
      }
    }

    const existingMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId: invite.organizationId, userId: user.id },
    })
    if (existingMember) {
      throw new ConflictException(
        'You are already a member of this organization'
      )
    }

    await this.claim(invite, user.id)
    await this.join(invite, user.id)

    return {
      success: true,
      message: 'You have joined the organization',
      organizationId: invite.organizationId,
    }
  }

  /**
   * Atomically marks the invite as used. Only one caller can win the
   * update, which prevents a link from being used twice.
   */
  private async claim(invite: OrganizationInvite, userId?: string) {
    const { count } = await this.prisma.organizationInvite.updateMany({
      where: {
        id: invite.id,
        expiresAt: { gt: new Date() },
        ...openInviteWhere(),
      },
      data: { acceptedAt: new Date(), acceptedById: userId ?? null },
    })
    if (count !== 1) throw new ConflictException('Invite already used')
  }

  private async release(inviteId: string) {
    await this.prisma.organizationInvite.updateMany({
      where: { id: inviteId },
      data: { acceptedAt: null, acceptedById: null },
    })
  }

  private async join(invite: OrganizationInvite, userId: string) {
    await this.prisma.organizationMember.create({
      data: {
        userId,
        organizationId: invite.organizationId,
        role: invite.role,
      },
    })
    await this.prisma.organizationInvite.updateMany({
      where: { id: invite.id },
      data: { acceptedById: userId },
    })
    await this.auditLogs.create({
      action: 'invite.accepted',
      entityType: 'OrganizationInvite',
      entityId: invite.id,
      userId,
      organizationId: invite.organizationId,
      newValues: { email: invite.email ?? null, role: invite.role },
    })
  }
}
