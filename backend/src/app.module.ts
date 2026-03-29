import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { winstonConfig } from './shared/logger/winston.config'
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
import { ExperimentsModule } from './modules/experiments/experiments.module'
import { EventsModule } from './modules/events/events.module'
import { MailService } from './shared/mail.service'
import { MailerModule } from './shared/mailer.module'
import { MetricsModule } from './shared/metrics/metrics.module'
import { PrismaModule } from './shared/prisma.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    winstonConfig,
    PrismaModule,
    MailerModule,
    MetricsModule,
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
    ExperimentsModule,
    EventsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    MailService,
  ],
  exports: [MailService],
})
export class AppModule {}
