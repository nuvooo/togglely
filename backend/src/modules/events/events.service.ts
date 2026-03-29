import { Injectable, Logger } from '@nestjs/common'
import { ExperimentEventType } from '@prisma/client'
import { PrismaService } from '../../shared/prisma.service'
import { TrackEventDto } from './dto/track-events.dto'

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async trackEvents(
    projectKey: string,
    environmentKey: string,
    events: TrackEventDto[],
  ): Promise<{ accepted: number }> {
    let accepted = 0

    for (const event of events) {
      try {
        // Find the experiment by key and project
        const experiment = await this.prisma.experiment.findFirst({
          where: {
            key: event.experimentKey,
            project: { key: projectKey },
            environment: { key: environmentKey },
          },
          include: { variants: true },
        })

        if (!experiment) {
          this.logger.warn(
            `[Events] Experiment not found: ${event.experimentKey}`,
          )
          continue
        }

        // Resolve variant ID if variantKey provided
        let variantId: string | null = null
        if (event.variantKey) {
          const variant = experiment.variants.find(
            (v) => v.key === event.variantKey,
          )
          if (variant) {
            variantId = variant.id
          }
        }

        // Map event type
        let eventType: ExperimentEventType
        switch (event.type) {
          case 'exposure':
            eventType = 'EXPOSURE'
            break
          case 'conversion':
            eventType = 'CONVERSION'
            break
          default:
            eventType = 'CUSTOM'
        }

        await this.prisma.experimentEvent.create({
          data: {
            experiment: { connect: { id: experiment.id } },
            variant: variantId ? { connect: { id: variantId } } : undefined,
            type: eventType,
            userId: event.userId,
            metadata: (event.metadata as any) ?? undefined,
          },
        })

        accepted++
      } catch (error) {
        this.logger.error(
          `[Events] Failed to track event for ${event.experimentKey}:`,
          error,
        )
      }
    }

    return { accepted }
  }
}
