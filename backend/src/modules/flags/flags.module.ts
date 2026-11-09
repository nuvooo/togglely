import { Module } from '@nestjs/common'
import { FlagsController } from './flags.controller'
import { FlagsService } from './flags.service'
import { TargetingRulesController } from './targeting-rules.controller'
import { TargetingRulesService } from './targeting-rules.service'

@Module({
  controllers: [FlagsController, TargetingRulesController],
  providers: [FlagsService, TargetingRulesService],
  exports: [FlagsService],
})
export class FlagsModule {}
