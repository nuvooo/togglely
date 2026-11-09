import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AccessService, isObjectId } from '../../shared/access/access.service'
import { PrismaService } from '../../shared/prisma.service'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { PasswordResetService } from '../password-reset/password-reset.service'

export const RESET_REQUIRES_SERVER_ADMIN = 'RESET_REQUIRES_SERVER_ADMIN'

/**
 * Lets organization OWNERs hand out password reset links when no mail
 * server is configured. Accounts are global, so a link may only be created
 * if the actor owns every organization the target belongs to; otherwise an
 * owner of one tenant could take over an account used in another tenant.
 */
@Injectable()
export class MemberPasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly passwordReset: PasswordResetService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async createLink(orgId: string, actorId: string, targetUserId: string) {
    await this.access.assertOrgRole(actorId, orgId, 'OWNER')

    if (!isObjectId(targetUserId)) {
      throw new NotFoundException('Member not found')
    }
    const target = await this.prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId: targetUserId },
    })
    if (!target) throw new NotFoundException('Member not found')

    const [targetOrgs, ownedOrgs] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { userId: targetUserId },
        select: { organizationId: true },
      }),
      this.prisma.organizationMember.findMany({
        where: { userId: actorId, role: 'OWNER' },
        select: { organizationId: true },
      }),
    ])
    const owned = new Set(ownedOrgs.map((m) => m.organizationId))
    if (targetOrgs.some((m) => !owned.has(m.organizationId))) {
      throw new ForbiddenException({
        message:
          'User also belongs to other organizations – ask the server administrator',
        error: 'Forbidden',
        code: RESET_REQUIRES_SERVER_ADMIN,
      })
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true },
    })
    if (!user) throw new NotFoundException('Member not found')
    if (!user.isActive) {
      throw new BadRequestException('User account is deactivated')
    }

    const { resetUrl, expiresAt } =
      await this.passwordReset.createResetLink(targetUserId)

    await this.auditLogs.create({
      action: 'user.password_reset_link_created',
      entityType: 'User',
      entityId: targetUserId,
      userId: actorId,
      organizationId: orgId,
      newValues: { expiresAt: expiresAt.toISOString() },
    })

    return { resetUrl, expiresAt }
  }
}
