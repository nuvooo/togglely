import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrganizationRole } from '@prisma/client'
import { randomBytes } from 'crypto'
import { isObjectId } from '../../shared/access/access.service'
import {
  INVITE_TTL_DAYS,
  inviteStatus,
  openInviteWhere,
} from '../../shared/invites'
import { MailService } from '../../shared/mail.service'
import { PrismaService } from '../../shared/prisma.service'
import { hashToken } from '../../shared/utils'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { assertCanGrantRole } from './roles'

/** Accepted/revoked/expired invites stay visible in the list this long. */
const RECENT_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export interface InviteActor {
  userId: string
  role: OrganizationRole
}

/**
 * Invite links of an organization. Tokens are 32 random bytes, stored only
 * as SHA-256 hash; the plain token is returned once in the create response.
 */
@Injectable()
export class OrganizationInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService
  ) {}

  /** Invite links always point to the configured frontend. */
  private get frontendUrl(): string {
    const url =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    return url.replace(/\/+$/, '')
  }

  async create(
    organizationId: string,
    actor: InviteActor,
    body: { email?: string; role?: OrganizationRole }
  ) {
    const role = body.role ?? 'MEMBER'
    assertCanGrantRole(actor.role, role)
    const email = body.email?.trim() || null

    if (email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      })
      if (existingUser) {
        const member = await this.prisma.organizationMember.findFirst({
          where: { organizationId, userId: existingUser.id },
        })
        if (member) throw new ConflictException('User is already a member')
      }

      // At most one open invite per (organization, email): replace it
      await this.prisma.organizationInvite.updateMany({
        where: { organizationId, email, ...openInviteWhere() },
        data: { revokedAt: new Date() },
      })
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS)

    const invite = await this.prisma.organizationInvite.create({
      data: {
        email,
        organizationId,
        role,
        tokenHash: hashToken(token),
        expiresAt,
        createdById: actor.userId,
      },
    })

    let emailSent = false
    if (email && this.mailService.isEnabled()) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      })
      emailSent = await this.mailService.sendInviteEmail(
        email,
        token,
        organization?.name || 'Organization',
        this.frontendUrl
      )
    }

    await this.auditLogs.create({
      action: 'invite.created',
      entityType: 'OrganizationInvite',
      entityId: invite.id,
      userId: actor.userId,
      organizationId,
      newValues: { email, role, expiresAt },
    })

    return {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
      inviteUrl: `${this.frontendUrl}/invite/${token}`,
      emailSent,
    }
  }

  /** Open invites plus those accepted/revoked/expired recently. */
  async list(organizationId: string) {
    const now = new Date()
    const since = new Date(now.getTime() - RECENT_DAYS * DAY_MS)

    const invites = await this.prisma.organizationInvite.findMany({
      where: {
        organizationId,
        OR: [
          { createdAt: { gte: since } },
          { acceptedAt: { gte: since } },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })

    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email ?? null,
      role: invite.role,
      status: inviteStatus(invite, now),
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt ?? null,
      revokedAt: invite.revokedAt ?? null,
    }))
  }

  async revoke(organizationId: string, inviteId: string, userId: string) {
    if (!isObjectId(inviteId)) throw new NotFoundException('Invite not found')

    const invite = await this.prisma.organizationInvite.findFirst({
      where: { id: inviteId, organizationId },
    })
    if (!invite) throw new NotFoundException('Invite not found')
    if (invite.acceptedAt) throw new ConflictException('Invite already used')
    if (invite.revokedAt) return

    const { count } = await this.prisma.organizationInvite.updateMany({
      where: { id: inviteId, organizationId, ...openInviteWhere() },
      data: { revokedAt: new Date() },
    })
    if (count === 0) throw new ConflictException('Invite already used')

    await this.auditLogs.create({
      action: 'invite.revoked',
      entityType: 'OrganizationInvite',
      entityId: inviteId,
      userId,
      organizationId,
      oldValues: { email: invite.email, role: invite.role },
    })
  }
}
