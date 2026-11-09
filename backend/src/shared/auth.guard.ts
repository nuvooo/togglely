import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as jwt from 'jsonwebtoken'
import { PrismaService } from './prisma.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided')
    }

    const token = authHeader.substring(7)
    const jwtSecret = this.config.get<string>('JWT_SECRET')

    if (!jwtSecret) {
      throw new InternalServerErrorException(
        'Authentication is not configured correctly'
      )
    }

    let decoded: jwt.JwtPayload
    try {
      const verified = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
      if (typeof verified === 'string') throw new Error('Invalid payload')
      decoded = verified
    } catch {
      throw new UnauthorizedException('Invalid token')
    }

    if (typeof decoded.userId !== 'string') {
      throw new UnauthorizedException('Invalid token')
    }

    // Reject tokens of deleted/deactivated users and tokens issued before
    // the last password change (session revocation).
    const user = await this.prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { isActive: true, passwordChangedAt: true },
    })

    if (!user || user.isActive === false) {
      throw new UnauthorizedException('Invalid token')
    }

    if (
      user.passwordChangedAt &&
      typeof decoded.iat === 'number' &&
      decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Session expired, please log in again')
    }

    request.user = decoded
    return true
  }
}
