import { Module } from '@nestjs/common'
import { MailerModule } from '../../shared/mailer.module'
import { PrismaModule } from '../../shared/prisma.module'
import { PasswordResetModule } from '../password-reset/password-reset.module'
import { MemberPasswordResetService } from './member-password-reset.service'
import { OrganizationInvitesService } from './organization-invites.service'
import { OrganizationsController } from './organizations.controller'
import { OrganizationsService } from './organizations.service'

@Module({
  imports: [PrismaModule, MailerModule, PasswordResetModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    OrganizationInvitesService,
    MemberPasswordResetService,
  ],
})
export class OrganizationsModule {}
