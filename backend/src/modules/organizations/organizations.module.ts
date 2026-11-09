import { Module } from '@nestjs/common'
import { MailerModule } from '../../shared/mailer.module'
import { PrismaModule } from '../../shared/prisma.module'
import { OrganizationInvitesService } from './organization-invites.service'
import { OrganizationsController } from './organizations.controller'
import { OrganizationsService } from './organizations.service'

@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationInvitesService],
})
export class OrganizationsModule {}
