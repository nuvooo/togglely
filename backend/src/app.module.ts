import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './modules/health/health.controller';
import { FlagsModule } from './modules/flags/flags.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { BrandsModule } from './modules/brands/brands.module';
import { SdkModule } from './modules/sdk/sdk.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PasswordResetModule } from './modules/password-reset/password-reset.module';
import { EnvironmentsModule } from './modules/environments/environments.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { PrismaModule } from './shared/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
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
  controllers: [HealthController],
})
export class AppModule {}
