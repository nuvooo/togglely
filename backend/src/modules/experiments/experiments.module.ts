import { Module } from '@nestjs/common'
import { ExperimentsService } from './experiments.service'
import { ExperimentResultsService } from './experiment-results.service'
import { ExperimentsController } from './experiments.controller'
import { AuditLogsModule } from '../audit-logs/audit-logs.module'

@Module({
  imports: [AuditLogsModule],
  controllers: [ExperimentsController],
  providers: [ExperimentsService, ExperimentResultsService],
  exports: [ExperimentsService, ExperimentResultsService],
})
export class ExperimentsModule {}
