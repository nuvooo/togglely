import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { SetupDto } from './dto/setup.dto'
import { SetupService } from './setup.service'

/**
 * Public first-run setup. Shares the `setup` prefix with the demo reset
 * controller (`POST /setup/reset-demo`); the sub-routes do not overlap.
 */
@ApiTags('Setup')
@Controller('setup')
export class InstanceSetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  async status() {
    return this.setupService.getStatus()
  }

  @Post()
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  async setup(@Body() dto: SetupDto) {
    return this.setupService.setup(dto)
  }
}
