import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Organization, OrganizationInvite, Prisma, User } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { isObjectId } from '../../shared/access/access.service'
import { openInviteWhere } from '../../shared/invites'
import { MailService } from '../../shared/mail.service'
import { PrismaService } from '../../shared/prisma.service'
import { findUserByEmail } from '../../shared/users'
import { BCRYPT_ROUNDS, hashToken } from '../../shared/utils'
import { normalizeEmail } from '../../shared/validation/normalize-email'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { AuthService } from './auth.service'
import { InviteRegisterDto } from './dto/invite-register.dto'

type InviteWithOrg = OrganizationInvite & {
  organization: Pick<Organization, 'id' | 'name'>
}

/** Tokens are 64 hex chars (legacy: UUIDs); anything much longer is bogus. */
const MAX_TOKEN_LENGTH = 200
const TRANSACTION_TIMEOUT_MS = 10_000

const sameEmail = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

const prismaCode = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null

const inviteUsed = () => new ConflictException('Invite already used')
const accountExists = () =>
  new ConflictException(
    'An account with this email already exists. Please log in and accept the invite.'
  )
const alreadyMember = () =>
  new ConflictException('You are already a member of this organization')

/**
 * Using invite links: lookup, registration via link and joining an
 * organization as an existing user.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name)

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
    if (invite.acceptedAt) throw inviteUsed()
    if (invite.expiresAt <= new Date()) {
      throw new NotFoundException('Invite expired')
    }
    return invite
  }

  async getInfo(token: string) {
    const invite = await this.findValidInvite(token)
    let existingUser = false
    if (invite.email) {
      const user = await findUserByEmail(this.prisma, invite.email)
      // An account the bound invite may take over counts as free, so the
      // invitee is offered registration instead of a login they cannot do.
      existingUser = !!user && !(await this.isReplaceable(user))
    }

    return {
      organizationName: invite.organization.name,
      role: invite.role,
      email: invite.email ?? null,
      existingUser,
    }
  }

  /**
   * Creates an account via an invite link and joins the organization.
   * User, invite claim and membership are written in one transaction, so a
   * failure leaves neither an orphaned account nor a used invite behind.
   */
  async register(token: string, body: InviteRegisterDto) {
    const invite = await this.findValidInvite(token)

    // A bound invite proves the address (the link was sent to it); an open
    // link proves nothing about the address the user types in.
    const bound = !!invite.email
    const email = normalizeEmail(invite.email || body.email || '')
    if (!email) throw new BadRequestException('Email is required')

    const existing = await findUserByEmail(this.prisma, email)
    // Only a bound invite may take over an account: it proves the address
    if (existing && !(bound && (await this.isReplaceable(existing)))) {
      throw accountExists()
    }

    const firstName = body.firstName.trim()
    const lastName = body.lastName.trim()
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
    // Open links create unverified accounts (verification token stored hashed)
    const emailVerifyToken = bound ? null : randomBytes(32).toString('hex')
    const profile = {
      password: passwordHash,
      firstName,
      lastName,
      emailVerified: bound,
      emailVerifyToken: emailVerifyToken ? hashToken(emailVerifyToken) : null,
    }

    let user: User
    try {
      user = await this.prisma.$transaction(
        async (tx) => {
          const created = existing
            ? await this.takeOver(tx, existing.id, email, profile)
            : await tx.user.create({ data: { email, ...profile } })
          await this.claimAndJoin(tx, invite, created.id)
          return created
        },
        { timeout: TRANSACTION_TIMEOUT_MS }
      )
    } catch (error) {
      // P2002: the email was registered in parallel
      if (prismaCode(error) === 'P2002') throw accountExists()
      if (prismaCode(error) === 'P2034') throw inviteUsed()
      throw error
    }

    await this.auditAccepted(invite, user.id)

    if (emailVerifyToken && this.mailService.isEnabled()) {
      await this.mailService.sendVerificationEmail(
        email,
        emailVerifyToken,
        this.frontendUrl
      )
    }

    const sessionToken = await this.authService.issueToken(user)
    return {
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        name: `${firstName} ${lastName}`.trim(),
        emailVerified: user.emailVerified,
      },
    }
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
          // Accounts and invites from before email normalization may differ
          // in case only
          email: { equals: normalizeEmail(user.email), mode: 'insensitive' },
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
    if (existingMember) throw alreadyMember()

    try {
      await this.prisma.$transaction(
        (tx) => this.claimAndJoin(tx, invite, user.id),
        { timeout: TRANSACTION_TIMEOUT_MS }
      )
    } catch (error) {
      // The claim was rolled back, so the invite stays usable
      if (prismaCode(error) === 'P2002') throw alreadyMember()
      if (prismaCode(error) === 'P2034') throw inviteUsed()
      throw error
    }

    await this.auditAccepted(invite, user.id)

    return {
      success: true,
      message: 'You have joined the organization',
      organizationId: invite.organizationId,
    }
  }

  /**
   * An unverified account without any membership never proved its address
   * and has no access to anything: someone may have registered the address
   * via an open link before its owner got a bound invite.
   */
  private async isReplaceable(
    user: Pick<User, 'id' | 'emailVerified'>,
    client: Prisma.TransactionClient = this.prisma
  ): Promise<boolean> {
    if (user.emailVerified) return false
    const memberships = await client.organizationMember.count({
      where: { userId: user.id },
    })
    return memberships === 0
  }

  /**
   * Hands an unverified, membership-less account to the owner of the
   * address (proven by the bound invite). It is updated in place rather
   * than deleted, so references (audit logs, ...) stay intact; the new
   * password and `passwordChangedAt` revoke the previous holder's access.
   */
  private async takeOver(
    tx: Prisma.TransactionClient,
    userId: string,
    email: string,
    profile: Pick<
      User,
      'password' | 'firstName' | 'lastName' | 'emailVerified'
    > & { emailVerifyToken: string | null }
  ): Promise<User> {
    const current = await tx.user.findUnique({ where: { id: userId } })
    if (!current || !(await this.isReplaceable(current, tx))) {
      throw accountExists()
    }

    this.logger.warn(
      `Unverified account ${userId} taken over via a bound invite`
    )
    return tx.user.update({
      where: { id: userId },
      data: {
        ...profile,
        email,
        emailVerified: true,
        emailVerifyToken: null,
        resetToken: null,
        resetTokenExpiry: null,
        passwordChangedAt: new Date(),
      },
    })
  }

  /**
   * Marks the invite as used and creates the membership; must run inside a
   * transaction. The conditional update lets only one caller win the claim,
   * which prevents a link from being used twice.
   */
  private async claimAndJoin(
    tx: Prisma.TransactionClient,
    invite: OrganizationInvite,
    userId: string
  ) {
    const { count } = await tx.organizationInvite.updateMany({
      where: {
        id: invite.id,
        expiresAt: { gt: new Date() },
        ...openInviteWhere(),
      },
      data: { acceptedAt: new Date(), acceptedById: userId },
    })
    if (count !== 1) throw inviteUsed()

    await tx.organizationMember.create({
      data: {
        userId,
        organizationId: invite.organizationId,
        role: invite.role,
      },
    })
  }

  private async auditAccepted(invite: OrganizationInvite, userId: string) {
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
