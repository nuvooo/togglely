import { Module } from '@nestjs/common'
import { PrismaModule } from '../../shared/prisma.module'
import { OverviewController } from './overview.controller'
import { OverviewService } from './overview.service'

@Module({
  imports: [PrismaModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
