import { Module } from '@nestjs/common'
import { SdkModule } from '../sdk/sdk.module'
import { EventsService } from './events.service'
import { EventsController } from './events.controller'

@Module({
  imports: [SdkModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
