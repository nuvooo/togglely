import { Controller, Get, Headers, Param, Query } from '@nestjs/common'
import { SdkService } from './sdk.service'
import { ToggleContext } from './evaluation.service'

@Controller('sdk')
export class SdkController {
  constructor(private readonly sdkService: SdkService) {}

  private resolveApiKey(queryApiKey?: string, authHeader?: string): string {
    if (queryApiKey) return queryApiKey
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
    return ''
  }

  private resolveBrandKey(
    brandKey?: string,
    tenantId?: string
  ): string | undefined {
    return brandKey || tenantId
  }

  private parseContext(contextParam?: string): ToggleContext {
    if (!contextParam) return {}
    try {
      const parsed = JSON.parse(contextParam)
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as ToggleContext
      }
    } catch {
      // Invalid JSON — return empty context
    }
    return {}
  }

  @Get('flags/:projectKey/:environmentKey/:flagKey')
  async evaluateFlag(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
    @Param('flagKey') flagKey: string,
    @Query('apiKey') queryApiKey?: string,
    @Query('brandKey') brandKey?: string,
    @Query('tenantId') tenantId?: string,
    @Query('context') contextParam?: string,
    @Headers('origin') origin?: string,
    @Headers('authorization') authHeader?: string
  ) {
    const apiKey = this.resolveApiKey(queryApiKey, authHeader)
    const resolvedBrandKey = this.resolveBrandKey(brandKey, tenantId)
    const context = this.parseContext(contextParam)
    return this.sdkService.evaluateFlag(
      projectKey,
      environmentKey,
      flagKey,
      apiKey,
      resolvedBrandKey,
      origin,
      context
    )
  }

  @Get('flags/:projectKey/:environmentKey')
  async getAllFlags(
    @Param('projectKey') projectKey: string,
    @Param('environmentKey') environmentKey: string,
    @Query('apiKey') queryApiKey?: string,
    @Query('brandKey') brandKey?: string,
    @Query('tenantId') tenantId?: string,
    @Query('context') contextParam?: string,
    @Headers('origin') origin?: string,
    @Headers('authorization') authHeader?: string
  ) {
    const apiKey = this.resolveApiKey(queryApiKey, authHeader)
    const resolvedBrandKey = this.resolveBrandKey(brandKey, tenantId)
    const context = this.parseContext(contextParam)
    return this.sdkService.getAllFlags(
      projectKey,
      environmentKey,
      apiKey,
      resolvedBrandKey,
      origin,
      context
    )
  }
}
