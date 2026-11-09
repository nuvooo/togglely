import { Module } from '@nestjs/common'
import { MailerModule } from '../../shared/mailer.module'
import { PrismaModule } from '../../shared/prisma.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { InvitesService } from './invites.service'
import { SetupController } from './setup.controller'

@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [AuthController, SetupController],
  providers: [AuthService, InvitesService],
  exports: [AuthService],
})
export class AuthModule {}
