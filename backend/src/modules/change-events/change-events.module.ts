import { Global, Logger, Module } from '@nestjs/common'
import { CHANGE_BUS, createChangeBus } from './change-bus'
import { ChangeEventsService } from './change-events.service'

/**
 * Configuration versions and change events. Global so mutating services
 * (flags, brands, environments, ...) can inject ChangeEventsService and
 * consumers (SDK stream, webhooks) the CHANGE_BUS without extra imports.
 */
@Global()
@Module({
  providers: [
    {
      provide: CHANGE_BUS,
      useFactory: () => createChangeBus(process.env, new Logger('ChangeBus')),
    },
    ChangeEventsService,
  ],
  exports: [CHANGE_BUS, ChangeEventsService],
})
export class ChangeEventsModule {}
