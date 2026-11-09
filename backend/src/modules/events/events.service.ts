import { Injectable, Logger } from '@nestjs/common'
import { ExperimentEventType, Prisma } from '@prisma/client'
import { PrismaService } from '../../shared/prisma.service'
import { SdkService } from '../sdk/sdk.service'
import {
  MAX_EVENT_METADATA_BYTES,
  MAX_EVENTS_PER_BATCH,
  metadataSize,
  TrackEventDto,
} from './dto/track-events.dto'

const EVENT_TYPE_MAP: Record<string, ExperimentEventType> = {
  exposure: 'EXPOSURE',
  conversion: 'CONVERSION',
  custom: 'CUSTOM',
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly sdkService: SdkService
  ) {}

  /**
   * Track a batch of SDK experiment events.
   *
   * The API key is validated and the project/environment are resolved within
   * the key's organization; experiments are only looked up inside that
   * project/environment, so events can never be written to another tenant's
   * experiments. Only RUNNING experiments accept events.
   */
  async trackEvents(
    projectKey: string,
    environmentKey: string,
    apiKey: string,
    origin: string | undefined,
    events: TrackEventDto[]
  ): Promise<{ accepted: number }> {
    const { project, environment } = await this.sdkService.resolveSdkAccess(
      projectKey,
      environmentKey,
      apiKey,
      origin
    )

    if (!Array.isArray(events) || events.length === 0) {
      return { accepted: 0 }
    }

    // Defense in depth: the DTO enforces these limits as well
    const batch = events.slice(0, MAX_EVENTS_PER_BATCH)

    // Resolve each distinct experiment key once per batch
    const experimentKeys = [
      ...new Set(
        batch
          .map((e) => e?.experimentKey)
          .filter((k): k is string => typeof k === 'string' && k.length > 0)
      ),
    ]
    if (experimentKeys.length === 0) {
      return { accepted: 0 }
    }

    const experiments = await this.prisma.experiment.findMany({
      where: {
        key: { in: experimentKeys },
        projectId: project.id,
        environmentId: environment.id,
        status: 'RUNNING',
      },
      include: { variants: true },
    })
    const experimentsByKey = new Map(experiments.map((e) => [e.key, e]))

    const rows: Prisma.ExperimentEventCreateManyInput[] = []
    for (const event of batch) {
      const experiment = experimentsByKey.get(event.experimentKey)
      if (!experiment) {
        this.logger.debug(
          `[Events] Experiment not found or not running: ${event.experimentKey}`
        )
        continue
      }

      const eventType = EVENT_TYPE_MAP[event.type]
      if (!eventType || typeof event.userId !== 'string' || !event.userId) {
        continue
      }

      if (
        event.metadata !== undefined &&
        metadataSize(event.metadata) > MAX_EVENT_METADATA_BYTES
      ) {
        continue
      }

      // Resolve variant ID if variantKey provided
      const variant = event.variantKey
        ? experiment.variants.find((v) => v.key === event.variantKey)
        : undefined

      rows.push({
        experimentId: experiment.id,
        variantId: variant?.id ?? null,
        type: eventType,
        userId: event.userId,
        metadata:
          event.metadata !== undefined && event.metadata !== null
            ? (event.metadata as Prisma.InputJsonValue)
            : undefined,
      })
    }

    if (rows.length === 0) {
      return { accepted: 0 }
    }

    try {
      const result = await this.prisma.experimentEvent.createMany({
        data: rows,
      })
      return { accepted: result.count }
    } catch (error) {
      this.logger.error('[Events] Failed to store event batch', error)
      return { accepted: 0 }
    }
  }
}
