import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import * as jwt from 'jsonwebtoken'
import { PrismaService } from '../../shared/prisma.service'
import { BCRYPT_ROUNDS, hashToken } from '../../shared/utils'

// Pre-computed hash used to equalize login timing for unknown emails,
// so response times do not reveal which accounts exist.
const DUMMY_PASSWORD_HASH =
  '$2a$12$9BQvanbQvtm09gxAxqPElO1AbdWrGbzR1iBja8eT.GvihPq.Qj2py'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
      this.logger.warn('Login failed: user not found')
      throw new UnauthorizedException('Invalid credentials')
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      this.logger.warn('Login failed: invalid password')
      throw new UnauthorizedException('Invalid credentials')
    }

    if (user.isActive === false) {
      this.logger.warn('Login failed: user is deactivated')
      throw new UnauthorizedException('Invalid credentials')
    }

    // Get user's organization
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id },
    })

    const token = this.signToken({
      userId: user.id,
      email: user.email,
      organizationId: membership?.organizationId,
    })

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      },
    }
  }

  /**
   * Creates a user. The plain email verification token is returned
   * separately so the caller can email it; it must never be sent back
   * to the HTTP client.
   */
  async register(
    email: string,
    password: string,
    name: string,
    firstName?: string,
    lastName?: string,
    emailVerified: boolean = false
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) throw new ConflictException('Email already exists')

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const [parsedFirstName, ...lastNameParts] = name.split(' ')
    const finalFirstName = firstName || parsedFirstName
    const finalLastName = lastName || lastNameParts.join(' ') || ''

    // Create verification token if email not verified (stored hashed)
    const emailVerifyToken = emailVerified
      ? null
      : randomBytes(32).toString('hex')

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        firstName: finalFirstName,
        lastName: finalLastName,
        emailVerified,
        emailVerifyToken: emailVerifyToken ? hashToken(emailVerifyToken) : null,
      },
    })

    // No automatic organization creation - user must create one manually

    const token = this.signToken({ userId: user.id, email: user.email })

    return {
      token,
      emailVerifyToken,
      user: {
        id: user.id,
        email: user.email,
        name: `${finalFirstName} ${finalLastName}`,
        emailVerified,
      },
    }
  }

  /** Issues a fresh session token, e.g. after a password change. */
  async issueToken(user: { id: string; email: string }) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id },
    })
    return this.signToken({
      userId: user.id,
      email: user.email,
      organizationId: membership?.organizationId,
    })
  }

  private signToken(payload: Record<string, unknown>): string {
    return jwt.sign(payload, this.getJwtSecret(), {
      algorithm: 'HS256',
      expiresIn: (this.config.get<string>('JWT_EXPIRY') ||
        '7d') as jwt.SignOptions['expiresIn'],
    })
  }

  private getJwtSecret(): string {
    const jwtSecret = this.config.get<string>('JWT_SECRET')

    if (!jwtSecret) {
      this.logger.error('JWT_SECRET is not configured')
      throw new InternalServerErrorException(
        'Authentication is not configured correctly'
      )
    }

    return jwtSecret
  }
}
