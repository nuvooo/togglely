import { Module } from '@nestjs/common'
import { FlagsModule } from '../flags/flags.module'
import { McpController } from './mcp.controller'
import { McpKeyResolver } from './mcp-key.resolver'
import { McpThrottlerGuard } from './mcp-throttler.guard'
import { McpToolsService } from './mcp-tools.service'

@Module({
  imports: [FlagsModule],
  controllers: [McpController],
  providers: [McpKeyResolver, McpToolsService, McpThrottlerGuard],
})
export class McpModule {}
