import { Injectable, UnauthorizedException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      this.logger.warn('Login failed: user not found');
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      this.logger.warn('Login failed: invalid password');
      throw new UnauthorizedException('Invalid credentials');
    }

    // Get user's organization
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        organizationId: membership?.organizationId,
      },
      this.getJwtSecret(),
      { expiresIn: '7d' },
    );

    return { 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: `${user.firstName} ${user.lastName}` 
      } 
    };
  }

  async register(
    email: string, 
    password: string, 
    name: string,
    firstName?: string,
    lastName?: string,
    emailVerified: boolean = false
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new UnauthorizedException('Email already exists');

    const passwordHash = await bcrypt.hash(password, 10);
    const [parsedFirstName, ...lastNameParts] = name.split(' ');
    const finalFirstName = firstName || parsedFirstName;
    const finalLastName = lastName || lastNameParts.join(' ') || '';
    
    // Create verification token if email not verified
    const emailVerifyToken = emailVerified ? null : randomUUID();
    
    // Create user
    const user = await this.prisma.user.create({
      data: { 
        email, 
        password: passwordHash, 
        firstName: finalFirstName, 
        lastName: finalLastName,
        emailVerified,
        emailVerifyToken,
      },
    });

    // No automatic organization creation - user must create one manually

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      this.getJwtSecret(),
      { expiresIn: '7d' },
    );

    return { 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: `${finalFirstName} ${finalLastName}`,
        emailVerified,
        emailVerifyToken: emailVerified ? undefined : emailVerifyToken, // Return token for testing
      } 
    };
  }

  private getJwtSecret(): string {
    const jwtSecret = this.config.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      this.logger.error('JWT_SECRET is not configured');
      throw new InternalServerErrorException('Authentication is not configured correctly');
    }

    return jwtSecret;
  }
}
