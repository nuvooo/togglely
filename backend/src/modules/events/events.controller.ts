import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common'
import { EventsService } from './events.service'
import { TrackEventsDto } from './dto/track-events.dto'
import { extractSdkApiKey, extractSdkOrigin } from '../sdk/sdk-http.utils'

@Controller('sdk/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post(':projectKey/:environmentKey')
  @HttpCode(202)
  async trackEvents(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
    @Body() dto: TrackEventsDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, unknown>
  ) {
    // Same API key sources as the flag endpoints: ?apiKey=, Authorization: Bearer, X-API-Key
    const request = { headers: headers ?? {}, query: query ?? {} }
    const apiKey = extractSdkApiKey(request)
    if (!apiKey) {
      throw new UnauthorizedException('API key required')
    }

    return this.eventsService.trackEvents(
      projectKey,
      environmentKey,
      apiKey,
      extractSdkOrigin(request),
      dto.events
    )
  }
}
