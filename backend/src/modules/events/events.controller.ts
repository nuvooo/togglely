import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { EventsService } from './events.service'
import { TrackEventsDto } from './dto/track-events.dto'

@Controller('sdk/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post(':projectKey/:environmentKey')
  @HttpCode(202)
  async trackEvents(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
    @Body() dto: TrackEventsDto,
    @Query('apiKey') queryApiKey?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    // Accept events asynchronously
    return this.eventsService.trackEvents(
      projectKey,
      environmentKey,
      dto.events,
    )
  }
}
