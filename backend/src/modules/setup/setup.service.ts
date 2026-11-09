import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { createHash, randomUUID, timingSafeEqual } from 'crypto'
import { MailService } from '../../shared/mail.service'
import { PrismaService } from '../../shared/prisma.service'
import { BCRYPT_ROUNDS } from '../../shared/utils'
import { AuthService } from '../auth/auth.service'
import { SetupDto } from './dto/setup.dto'

const SETUP_LOCK_KEY = 'setup'

/**
 * A lock older than this belongs to a setup that crashed between taking the
 * lock and committing (a successful setup leaves users behind, so the lock
 * is never considered once the instance is set up).
 */
const STALE_LOCK_MS = 5 * 60 * 1000
const TRANSACTION_TIMEOUT_MS = 10_000

const alreadySetUp = () => new ConflictException('Instance is already set up')

/** Unique violation (lock taken) or transaction write conflict. */
function isConcurrencyError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  )
}

/** Constant-time comparison; hashing first equalizes the lengths. */
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(a), digest(b))
}

/**
 * First-run setup of a fresh instance: creates the first user as OWNER of
 * the first organization. Only possible while no user exists.
 */
@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly mailService: MailService,
    private readonly config: ConfigService
  ) {}

  /**
   * Optional shared secret for public deployments: without it, whoever
   * reaches a fresh instance first becomes its owner.
   */
  private get setupToken(): string | undefined {
    return this.config.get<string>('SETUP_TOKEN') || undefined
  }

  private assertSetupToken(provided: string | undefined) {
    const expected = this.setupToken
    if (!expected) return
    if (typeof provided !== 'string' || !safeEqual(provided, expected)) {
      throw new ForbiddenException('Invalid setup token')
    }
  }

  async getStatus() {
    const users = await this.prisma.user.count()
    return {
      setupRequired: users === 0,
      mailEnabled: this.mailService.isEnabled(),
      setupTokenRequired: !!this.setupToken,
    }
  }

  async setup(dto: SetupDto) {
    this.assertSetupToken(dto.setupToken)
    if ((await this.prisma.user.count()) > 0) throw alreadySetUp()

    // Free a lock left behind by a setup that crashed mid-way
    await this.prisma.instanceLock.deleteMany({
      where: {
        key: SETUP_LOCK_KEY,
        createdAt: { lt: new Date(Date.now() - STALE_LOCK_MS) },
      },
    })

    // A second, parallel setup call fails on the unique lock key
    try {
      await this.prisma.instanceLock.create({ data: { key: SETUP_LOCK_KEY } })
    } catch (error) {
      if (isConcurrencyError(error)) throw alreadySetUp()
      throw error
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
    const [firstName, ...lastNameParts] = dto.name.trim().split(/\s+/)
    const lastName = lastNameParts.join(' ')

    let user: { id: string; email: string }
    try {
      user = await this.prisma.$transaction(
        async (tx) => {
          if ((await tx.user.count()) > 0) throw alreadySetUp()

          const created = await tx.user.create({
            data: {
              email: dto.email,
              password: passwordHash,
              firstName,
              lastName,
              emailVerified: true,
            },
          })
          const org = await tx.organization.create({
            data: { name: dto.organizationName, slug: randomUUID() },
          })
          await tx.organizationMember.create({
            data: { userId: created.id, organizationId: org.id, role: 'OWNER' },
          })
          return created
        },
        { timeout: TRANSACTION_TIMEOUT_MS }
      )
    } catch (error) {
      // Nothing was created, so release the lock to allow a retry
      await this.prisma.instanceLock
        .deleteMany({ where: { key: SETUP_LOCK_KEY } })
        .catch(() => undefined)
      if (isConcurrencyError(error)) throw alreadySetUp()
      throw error
    }

    this.logger.log(`Instance set up by user ${user.id}`)
    const token = await this.authService.issueToken(user)

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: `${firstName} ${lastName}`.trim(),
      },
    }
  }
}
