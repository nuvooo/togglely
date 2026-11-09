import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../../shared/auth.guard'
import { OverviewService } from './overview.service'

@Controller('overview')
@UseGuards(AuthGuard)
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  /** Counts, recently changed flags and projects of the caller's organizations. */
  @Get()
  getOverview(@Req() req: any) {
    return this.overviewService.getOverview(req.user.userId)
  }
}
