import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import { Request, Response } from 'express'
import { runWithActor } from '../../shared/actor-context'
import { McpContext, McpKeyResolver } from './mcp-key.resolver'
import { createMcpServer } from './mcp-server.factory'
import { MCP_THROTTLER, McpThrottlerGuard } from './mcp-throttler.guard'
import { McpToolsService } from './mcp-tools.service'

function jsonRpcError(
  res: Response,
  status: number,
  code: number,
  message: string
) {
  res
    .status(status)
    .json({ jsonrpc: '2.0', error: { code, message }, id: null })
}

/**
 * Stateless MCP endpoint (Streamable HTTP). Every POST gets its own server
 * and transport bound to the calling MCP key; there are no sessions.
 */
@Controller('mcp')
// Not counted by the global per-IP limit; limited per key by McpThrottlerGuard
@SkipThrottle()
@Throttle({
  [MCP_THROTTLER.name]: { limit: MCP_THROTTLER.limit, ttl: MCP_THROTTLER.ttl },
})
@UseGuards(McpThrottlerGuard)
export class McpController {
  private readonly logger = new Logger(McpController.name)

  constructor(
    private readonly resolver: McpKeyResolver,
    private readonly tools: McpToolsService
  ) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    let ctx: McpContext
    try {
      ctx = await this.resolver.resolve(req.headers.authorization)
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        res.setHeader('WWW-Authenticate', 'Bearer')
        return jsonRpcError(res, 401, -32001, 'Unauthorized')
      }
      throw error
    }

    await runWithActor(
      { apiKeyId: ctx.apiKeyId, apiKeyName: ctx.apiKeyName },
      async () => {
        const server = createMcpServer(ctx, this.tools)
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        })
        res.on('close', () => {
          transport.close().catch(() => undefined)
          server.close().catch(() => undefined)
        })
        try {
          await server.connect(transport)
          await transport.handleRequest(req, res, req.body)
        } catch (error) {
          this.logger.error(
            `MCP request failed: ${error instanceof Error ? error.message : error}`,
            error instanceof Error ? error.stack : undefined
          )
          if (!res.headersSent) {
            jsonRpcError(res, 500, -32603, 'Internal server error')
          }
        }
      }
    )
  }

  @Get()
  get(@Res() res: Response): void {
    this.methodNotAllowed(res)
  }

  @Delete()
  delete(@Res() res: Response): void {
    this.methodNotAllowed(res)
  }

  private methodNotAllowed(res: Response) {
    res.setHeader('Allow', 'POST')
    jsonRpcError(res, 405, -32000, 'Method not allowed.')
  }
}
