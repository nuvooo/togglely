import { Module } from '@nestjs/common'
import { FlagsController } from './flags.controller'
import { FlagsService } from './flags.service'
import { RuleScheduleWorker } from './rule-schedule.worker'
import { TargetingRulesController } from './targeting-rules.controller'
import { TargetingRulesService } from './targeting-rules.service'

@Module({
  controllers: [FlagsController, TargetingRulesController],
  providers: [FlagsService, TargetingRulesService, RuleScheduleWorker],
  exports: [FlagsService],
})
export class FlagsModule {}
