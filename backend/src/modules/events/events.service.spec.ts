import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { EventsService } from './events.service'
import { EventsController } from './events.controller'
import { TrackEventDto, TrackEventsDto } from './dto/track-events.dto'

const access = {
  organizationId: 'org-1',
  apiKeyId: 'key-1',
  project: { id: 'proj-1', key: 'shop' },
  environment: { id: 'env-1', key: 'production' },
}

const experiment = {
  id: 'exp-1',
  key: 'checkout-test',
  variants: [
    { id: 'var-a', key: 'control' },
    { id: 'var-b', key: 'treatment' },
  ],
}

function createService() {
  const prisma = {
    experiment: {
      findMany: jest.fn().mockResolvedValue([experiment]),
      findFirst: jest.fn(),
    },
    experimentEvent: {
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
      create: jest.fn(),
    },
  } as any
  const sdkService = {
    resolveSdkAccess: jest.fn().mockResolvedValue(access),
  } as any
  const service = new EventsService(prisma, sdkService)
  return { service, prisma, sdkService }
}

function event(overrides: Partial<TrackEventDto> = {}): TrackEventDto {
  return {
    type: 'conversion',
    experimentKey: 'checkout-test',
    variantKey: 'treatment',
    userId: 'user-1',
    ...overrides,
  }
}

describe('EventsService', () => {
  it('validates the API key and scopes experiment lookups to the resolved project/env', async () => {
    const { service, prisma, sdkService } = createService()

    const result = await service.trackEvents(
      'shop',
      'production',
      'api-key',
      'https://app.example.com',
      [event(), event({ type: 'exposure', userId: 'user-2' })]
    )

    expect(sdkService.resolveSdkAccess).toHaveBeenCalledWith(
      'shop',
      'production',
      'api-key',
      'https://app.example.com'
    )
    expect(prisma.experiment.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.experiment.findMany).toHaveBeenCalledWith({
      where: {
        key: { in: ['checkout-test'] },
        projectId: 'proj-1',
        environmentId: 'env-1',
        status: 'RUNNING',
      },
      include: { variants: true },
    })
    expect(prisma.experimentEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          experimentId: 'exp-1',
          variantId: 'var-b',
          type: 'CONVERSION',
          userId: 'user-1',
        }),
        expect.objectContaining({
          experimentId: 'exp-1',
          variantId: 'var-b',
          type: 'EXPOSURE',
          userId: 'user-2',
        }),
      ],
    })
    expect(prisma.experimentEvent.create).not.toHaveBeenCalled()
    expect(result).toEqual({ accepted: 2 })
  })

  it('does not write anything when API key validation fails', async () => {
    const { service, prisma, sdkService } = createService()
    sdkService.resolveSdkAccess.mockRejectedValue(
      new UnauthorizedException('Invalid API key')
    )

    await expect(
      service.trackEvents('shop', 'production', 'bad', undefined, [event()])
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(prisma.experiment.findMany).not.toHaveBeenCalled()
    expect(prisma.experimentEvent.createMany).not.toHaveBeenCalled()
  })

  it('propagates origin rejections', async () => {
    const { service, prisma, sdkService } = createService()
    sdkService.resolveSdkAccess.mockRejectedValue(
      new ForbiddenException('Origin not allowed')
    )

    await expect(
      service.trackEvents('shop', 'production', 'k', 'https://evil.com', [
        event(),
      ])
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.experimentEvent.createMany).not.toHaveBeenCalled()
  })

  it('resolves each distinct experiment key only once per batch', async () => {
    const { service, prisma } = createService()

    await service.trackEvents('shop', 'production', 'api-key', undefined, [
      event({ experimentKey: 'checkout-test' }),
      event({ experimentKey: 'checkout-test', userId: 'u2' }),
      event({ experimentKey: 'other-test' }),
    ])

    expect(prisma.experiment.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.experiment.findMany.mock.calls[0][0].where.key.in).toEqual([
      'checkout-test',
      'other-test',
    ])
  })

  it('skips events for unknown experiments and unknown variants map to null', async () => {
    const { service, prisma } = createService()

    const result = await service.trackEvents(
      'shop',
      'production',
      'api-key',
      undefined,
      [
        event({ experimentKey: 'not-in-this-project' }),
        event({ variantKey: 'nope' }),
      ]
    )

    expect(result).toEqual({ accepted: 1 })
    expect(prisma.experimentEvent.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ variantId: null }),
    ])
  })

  it('skips events with oversized metadata', async () => {
    const { service, prisma } = createService()

    const result = await service.trackEvents(
      'shop',
      'production',
      'api-key',
      undefined,
      [
        event({ metadata: { blob: 'x'.repeat(5000) } }),
        event({ metadata: { a: 1 } }),
      ]
    )

    expect(result).toEqual({ accepted: 1 })
    expect(
      prisma.experimentEvent.createMany.mock.calls[0][0].data
    ).toHaveLength(1)
  })

  it('returns accepted 0 without touching the DB for empty batches', async () => {
    const { service, prisma } = createService()

    const result = await service.trackEvents(
      'shop',
      'production',
      'k',
      undefined,
      []
    )

    expect(result).toEqual({ accepted: 0 })
    expect(prisma.experiment.findMany).not.toHaveBeenCalled()
  })
})

describe('EventsController', () => {
  function createController() {
    const eventsService = {
      trackEvents: jest.fn().mockResolvedValue({ accepted: 1 }),
    } as any
    return { controller: new EventsController(eventsService), eventsService }
  }

  it('rejects requests without an API key', async () => {
    const { controller, eventsService } = createController()

    await expect(
      controller.trackEvents('shop', 'production', { events: [] }, {}, {})
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(eventsService.trackEvents).not.toHaveBeenCalled()
  })

  it.each([
    [{ 'x-api-key': 'header-key' }, {}, 'header-key'],
    [{ authorization: 'Bearer bearer-key' }, {}, 'bearer-key'],
    [{}, { apiKey: 'query-key' }, 'query-key'],
  ])(
    'accepts the API key from headers or query (%#)',
    async (headers, query, expected) => {
      const { controller, eventsService } = createController()

      await controller.trackEvents(
        'shop',
        'production',
        { events: [] },
        { ...headers, origin: 'https://app.example.com' },
        query
      )

      expect(eventsService.trackEvents).toHaveBeenCalledWith(
        'shop',
        'production',
        expected,
        'https://app.example.com',
        []
      )
    }
  )

  it('ignores non-string apiKey query values', async () => {
    const { controller } = createController()

    await expect(
      controller.trackEvents(
        'shop',
        'production',
        { events: [] },
        {},
        { apiKey: { $ne: null } }
      )
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})

describe('TrackEventsDto validation', () => {
  async function errorsFor(body: unknown) {
    const dto = plainToInstance(TrackEventsDto, body)
    return validate(dto)
  }

  it('accepts a valid batch', async () => {
    expect(
      await errorsFor({ events: [event({ metadata: { plan: 'pro' } })] })
    ).toHaveLength(0)
  })

  it('rejects more than 100 events', async () => {
    const events = Array.from({ length: 101 }, () => event())
    expect((await errorsFor({ events })).length).toBeGreaterThan(0)
  })

  it('rejects unknown event types, overlong keys and oversized metadata', async () => {
    expect(
      (await errorsFor({ events: [event({ type: 'purchase' as any })] })).length
    ).toBeGreaterThan(0)
    expect(
      (await errorsFor({ events: [event({ userId: 'u'.repeat(257) })] })).length
    ).toBeGreaterThan(0)
    expect(
      (await errorsFor({ events: [event({ experimentKey: 'k'.repeat(257) })] }))
        .length
    ).toBeGreaterThan(0)
    expect(
      (
        await errorsFor({
          events: [event({ metadata: { blob: 'x'.repeat(5000) } })],
        })
      ).length
    ).toBeGreaterThan(0)
  })
})
