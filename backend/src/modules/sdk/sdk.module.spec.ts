import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../../shared/prisma.service'
import { CHANGE_BUS, InMemoryChangeBus } from '../change-events/change-bus'
import { ChangeEventsService } from '../change-events/change-events.service'
import { SdkModule } from './sdk.module'
import { SdkStreamHub } from './sdk-stream'

@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: {} },
    { provide: ChangeEventsService, useValue: { getVersion: jest.fn() } },
    { provide: CHANGE_BUS, useValue: new InMemoryChangeBus() },
  ],
  exports: [PrismaService, ChangeEventsService, CHANGE_BUS],
})
class FakeInfrastructureModule {}

describe('SdkModule', () => {
  it('provides a Nest-managed SdkStreamHub that is closed on shutdown', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeInfrastructureModule, SdkModule],
    }).compile()
    const hub = moduleRef.get(SdkStreamHub)
    expect(hub).toBeInstanceOf(SdkStreamHub)
    const close = jest.spyOn(hub, 'close')

    await moduleRef.close()

    expect(close).toHaveBeenCalled()
  })
})
