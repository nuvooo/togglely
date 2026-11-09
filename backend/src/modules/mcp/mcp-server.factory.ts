import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { Logger } from '@nestjs/common'
import { z } from 'zod'
import { McpContext } from './mcp-key.resolver'
import { McpToolError, McpToolsService } from './mcp-tools.service'

const logger = new Logger('McpServer')

const INSTRUCTIONS = `Togglely manages feature flags for exactly one project (the project this API key belongs to).

Workflow:
- Call get_project first to see the environments, brands and which environments this key may toggle (canToggle).
- Before create_flag, ALWAYS call list_flags with a search term to check whether a similar flag already exists. Reuse existing flags instead of creating duplicates.
- Flag keys are kebab-case (e.g. "new-checkout-flow").
- New flags start disabled everywhere; use set_flag_state to change them in an environment this key is allowed to toggle.
- Cleaning up a flag: first remove every usage of the flag from the code, then call delete_flag WITHOUT confirm to inspect its states, and only then call delete_flag again with confirm: true. Deletion is refused while the flag's states differ between environments/brands, while it has enabled targeting rules, or while an experiment using it has not ended.`

function ok(result: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

/**
 * Runs a tool method and turns every thrown error into an `isError` result.
 * Only McpToolError messages reach the client; anything else is logged and
 * reported generically so internals (e.g. Prisma errors) never leak.
 */
async function runTool(
  name: string,
  fn: () => Promise<unknown>
): Promise<CallToolResult> {
  try {
    return ok(await fn())
  } catch (error) {
    if (error instanceof McpToolError) return fail(error.message)
    logger.error(
      `Tool ${name} failed: ${error instanceof Error ? error.message : error}`,
      error instanceof Error ? error.stack : undefined
    )
    return fail('Internal error while running tool')
  }
}

const flagKey = z
  .string()
  .min(1)
  .describe('Key of the flag, e.g. "new-checkout"')

/** Builds a fresh MCP server bound to one authenticated MCP key. */
export function createMcpServer(
  ctx: McpContext,
  tools: McpToolsService
): McpServer {
  const server = new McpServer(
    { name: 'togglely', version: '1.0.0' },
    { instructions: INSTRUCTIONS }
  )

  server.registerTool(
    'get_project',
    {
      description:
        'Returns the project of this API key with its environments (including canToggle: whether this key may change flags there) and brands. Call this first.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true },
    },
    () => runTool('get_project', () => tools.getProject(ctx))
  )

  server.registerTool(
    'list_flags',
    {
      description:
        'Lists the flags of the project with their state per environment/brand. Use "search" (matches key or name) to check for existing flags before creating a new one.',
      inputSchema: z
        .object({
          search: z
            .string()
            .optional()
            .describe('Case-insensitive filter on flag key or name'),
        })
        .strict(),
      annotations: { readOnlyHint: true },
    },
    (args) => runTool('list_flags', () => tools.listFlags(ctx, args))
  )

  server.registerTool(
    'get_flag',
    {
      description:
        'Returns one flag with its type, description and state per environment/brand.',
      inputSchema: z.object({ flagKey }).strict(),
      annotations: { readOnlyHint: true },
    },
    (args) => runTool('get_flag', () => tools.getFlag(ctx, args))
  )

  server.registerTool(
    'create_flag',
    {
      description:
        'Creates a new flag (disabled in every environment). Check with list_flags first that no similar flag exists. Keys must be kebab-case.',
      inputSchema: z
        .object({
          key: z.string().min(1).describe('Unique kebab-case key'),
          name: z.string().min(1).describe('Human readable name'),
          description: z.string().optional(),
          type: z
            .enum(['BOOLEAN', 'STRING', 'NUMBER', 'JSON'])
            .describe('Value type of the flag'),
        })
        .strict(),
    },
    (args) => runTool('create_flag', () => tools.createFlag(ctx, args))
  )

  server.registerTool(
    'update_flag',
    {
      description: 'Changes the name and/or description of a flag.',
      inputSchema: z
        .object({
          flagKey,
          name: z.string().min(1).optional(),
          description: z.string().optional(),
        })
        .strict(),
    },
    (args) => runTool('update_flag', () => tools.updateFlag(ctx, args))
  )

  server.registerTool(
    'set_flag_state',
    {
      description:
        'Enables/disables a flag and/or sets its value in one environment. Changes only the environment default, not brand overrides. Only environments with canToggle (see get_project) are allowed.',
      inputSchema: z
        .object({
          flagKey,
          environmentKey: z
            .string()
            .min(1)
            .describe('Key of the environment, e.g. "development"'),
          enabled: z.boolean().optional(),
          value: z
            .string()
            .optional()
            .describe('Flag value as string (e.g. "true", "42", JSON text)'),
        })
        .strict(),
    },
    (args) => runTool('set_flag_state', () => tools.setFlagState(ctx, args))
  )

  server.registerTool(
    'delete_flag',
    {
      description:
        'Deletes a flag. Remove all usages from the code first. Call without confirm (or confirm: false) to inspect the flag states, then with confirm: true to delete. Refused while states differ between environments/brands, while the flag has enabled targeting rules, or while an experiment using it has not ended (see blockers).',
      inputSchema: z
        .object({
          flagKey,
          confirm: z
            .boolean()
            .default(false)
            .describe('Must be true to actually delete'),
        })
        .strict(),
      annotations: { destructiveHint: true },
    },
    (args) => runTool('delete_flag', () => tools.deleteFlag(ctx, args))
  )

  return server
}
