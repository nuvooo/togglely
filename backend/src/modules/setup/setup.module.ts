import { Module } from '@nestjs/common'
import { MailerModule } from '../../shared/mailer.module'
import { PrismaModule } from '../../shared/prisma.module'
import { AuthModule } from '../auth/auth.module'
import { InstanceSetupController } from './setup.controller'
import { SetupService } from './setup.service'

@Module({
  imports: [PrismaModule, MailerModule, AuthModule],
  controllers: [InstanceSetupController],
  providers: [SetupService],
})
export class SetupModule {}
