import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { MailService } from '../../shared/mail.service'
import { PrismaService } from '../../shared/prisma.service'
import { BCRYPT_ROUNDS } from '../../shared/utils'
import { AuthService } from '../auth/auth.service'
import { SetupDto } from './dto/setup.dto'

const SETUP_LOCK_KEY = 'setup'

const alreadySetUp = () => new ConflictException('Instance is already set up')

/** Unique violation (lock taken) or transaction write conflict. */
function isConcurrencyError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  )
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
    private readonly mailService: MailService
  ) {}

  async getStatus() {
    const users = await this.prisma.user.count()
    return {
      setupRequired: users === 0,
      mailEnabled: this.mailService.isEnabled(),
    }
  }

  async setup(dto: SetupDto) {
    if ((await this.prisma.user.count()) > 0) throw alreadySetUp()

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
      user = await this.prisma.$transaction(async (tx) => {
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
      })
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
