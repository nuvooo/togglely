import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module'
import { ApiKeysModule } from './modules/api-keys/api-keys.module'
import { AuthModule } from './modules/auth/auth.module'
import { BrandsModule } from './modules/brands/brands.module'
import { EnvironmentsModule } from './modules/environments/environments.module'
import { FlagsModule } from './modules/flags/flags.module'
import { HealthModule } from './modules/health/health.module'
import { OrganizationsModule } from './modules/organizations/organizations.module'
import { PasswordResetModule } from './modules/password-reset/password-reset.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { SdkModule } from './modules/sdk/sdk.module'
import { MailService } from './shared/mail.service'
import { MailerModule } from './shared/mailer.module'
import { PrismaModule } from './shared/prisma.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    MailerModule,
    HealthModule,
    AuditLogsModule,
    AuthModule,
    PasswordResetModule,
    OrganizationsModule,
    EnvironmentsModule,
    ApiKeysModule,
    FlagsModule,
    ProjectsModule,
    BrandsModule,
    SdkModule,
  ],
  providers: [MailService],
  exports: [MailService],
})
export class AppModule {}
