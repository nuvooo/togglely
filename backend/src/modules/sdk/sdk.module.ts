import { Logger, Module } from '@nestjs/common'
import { CHANGE_BUS, ChangeBus } from '../change-events/change-bus'
import { ChangeEventsService } from '../change-events/change-events.service'
import { EvaluationService } from './evaluation.service'
import { HashingService } from './hashing.service'
import { SdkService } from './sdk.service'
import { readSdkStreamOptions, SdkStreamHub } from './sdk-stream'

@Module({
  providers: [
    SdkService,
    EvaluationService,
    HashingService,
    {
      // Nest-managed so its onModuleDestroy ends open streams before the
      // HTTP server closes (app.enableShutdownHooks in main.ts)
      provide: SdkStreamHub,
      useFactory: (
        sdkService: SdkService,
        changeEvents: ChangeEventsService,
        bus: ChangeBus
      ) =>
        new SdkStreamHub(
          { sdkService, changeEvents, bus, logger: new Logger('SdkStream') },
          readSdkStreamOptions(process.env)
        ),
      inject: [SdkService, ChangeEventsService, CHANGE_BUS],
    },
  ],
  exports: [SdkService, EvaluationService, HashingService, SdkStreamHub],
})
export class SdkModule {}
