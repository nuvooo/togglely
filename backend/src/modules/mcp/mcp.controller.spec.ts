import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { currentActor } from '../../shared/actor-context'
import { McpModule } from './mcp.module'
import { McpContext, McpKeyResolver } from './mcp-key.resolver'
import { McpToolError, McpToolsService } from './mcp-tools.service'

const VALID_TOKEN = 'tkm_valid'

function contextFor(token: string): McpContext {
  return {
    apiKeyId: `key-${token}`,
    apiKeyName: `Key ${token}`,
    userId: 'user-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    allowedEnvironmentIds: ['env-dev'],
    role: 'MEMBER',
  }
}

describe('McpController (e2e with MCP SDK client)', () => {
  let app: INestApplication
  let baseUrl: string
  let clients: Client[]

  const resolver = {
    resolve: jest.fn(async (header?: string) => {
      const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1]
      if (!token?.startsWith('tkm_')) {
        throw new UnauthorizedException('Invalid API key')
      }
      return contextFor(token)
    }),
  }

  const tools = {
    getProject: jest.fn(),
    listFlags: jest.fn(),
    getFlag: jest.fn(),
    createFlag: jest.fn(),
    updateFlag: jest.fn(),
    setFlagState: jest.fn(),
    deleteFlag: jest.fn(),
  }

  /** Boots a fresh app (fresh in-memory throttler storage). */
  async function startApp() {
    await app?.close()
    const moduleRef = await Test.createTestingModule({
      imports: [
        // Same global throttler setup as AppModule: 100 req/min per IP
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
        McpModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    })
      .overrideProvider(McpKeyResolver)
      .useValue(resolver)
      .overrideProvider(McpToolsService)
      .useValue(tools)
      // Dependencies of FlagsModule (Prisma, audit logs, ...) are irrelevant here
      .useMocker(() => ({}))
      .compile()

    app = moduleRef.createNestApplication({ logger: false })
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    baseUrl = `http://127.0.0.1:${address.port}`
  }

  beforeAll(startApp)

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    clients = []
  })

  afterEach(async () => {
    await Promise.all(clients.map((c) => c.close()))
  })

  async function connect(token = VALID_TOKEN): Promise<Client> {
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/api/mcp`),
      { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
    )
    await client.connect(transport)
    clients.push(client)
    return client
  }

  function textOf(result: unknown): string {
    return (result as { content: { type: string; text: string }[] }).content[0]
      .text
  }

  function ping(token: string) {
    return fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    })
  }

  it('lists exactly the 7 tools', async () => {
    const client = await connect()

    const { tools: listed } = await client.listTools()

    expect(listed.map((t) => t.name).sort()).toEqual(
      [
        'create_flag',
        'delete_flag',
        'get_flag',
        'get_project',
        'list_flags',
        'set_flag_state',
        'update_flag',
      ].sort()
    )
    for (const tool of listed) {
      expect(tool.description).toBeTruthy()
    }
  })

  it('create_flag then set_flag_state call the tools service with the key context', async () => {
    tools.createFlag.mockResolvedValue({ key: 'new-checkout' })
    tools.setFlagState.mockResolvedValue({
      environmentKey: 'dev',
      enabled: true,
      value: 'true',
    })
    const client = await connect()

    const created = await client.callTool({
      name: 'create_flag',
      arguments: { key: 'new-checkout', name: 'New checkout', type: 'BOOLEAN' },
    })
    const toggled = await client.callTool({
      name: 'set_flag_state',
      arguments: {
        flagKey: 'new-checkout',
        environmentKey: 'dev',
        enabled: true,
      },
    })

    const ctx = contextFor(VALID_TOKEN)
    expect(tools.createFlag).toHaveBeenCalledWith(ctx, {
      key: 'new-checkout',
      name: 'New checkout',
      type: 'BOOLEAN',
    })
    expect(tools.setFlagState).toHaveBeenCalledWith(ctx, {
      flagKey: 'new-checkout',
      environmentKey: 'dev',
      enabled: true,
    })
    expect(created.isError).toBeFalsy()
    expect(JSON.parse(textOf(created))).toEqual({ key: 'new-checkout' })
    expect(JSON.parse(textOf(toggled))).toEqual({
      environmentKey: 'dev',
      enabled: true,
      value: 'true',
    })
  })

  it('create_flag rejects extra fields before reaching the service', async () => {
    const client = await connect()

    const result = await client.callTool({
      name: 'create_flag',
      arguments: {
        key: 'sneaky',
        name: 'Sneaky',
        type: 'BOOLEAN',
        environmentId: 'env-prod',
      },
    })

    expect(result.isError).toBe(true)
    expect(tools.createFlag).not.toHaveBeenCalled()
  })

  it('get_project works without arguments', async () => {
    tools.getProject.mockResolvedValue({ project: { key: 'shop' } })
    const client = await connect()

    const result = await client.callTool({ name: 'get_project' })

    expect(result.isError).toBeFalsy()
    expect(tools.getProject).toHaveBeenCalledWith(contextFor(VALID_TOKEN))
    expect(JSON.parse(textOf(result))).toEqual({ project: { key: 'shop' } })
  })

  it('tool error is returned as isError result, not HTTP error', async () => {
    tools.getFlag.mockRejectedValue(
      new McpToolError('Flag "nope" not found in this project')
    )
    const client = await connect()

    const result = await client.callTool({
      name: 'get_flag',
      arguments: { flagKey: 'nope' },
    })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('Flag "nope" not found in this project')
  })

  it('unexpected errors become a generic isError result', async () => {
    tools.listFlags.mockRejectedValue(
      new Error('PrismaClientKnownRequestError')
    )
    const client = await connect()

    const result = await client.callTool({ name: 'list_flags', arguments: {} })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('Internal error while running tool')
  })

  it('missing/invalid bearer → HTTP 401', async () => {
    const missing = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    })
    const invalid = await ping('not-an-mcp-key')

    for (const res of [missing, invalid]) {
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer')
    }
    expect(tools.getProject).not.toHaveBeenCalled()
  })

  it('GET /api/mcp → 405', async () => {
    const res = await fetch(`${baseUrl}/api/mcp`, {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(res.status).toBe(405)
    const body = await res.json()
    expect(body.jsonrpc).toBe('2.0')
    expect(body.error).toEqual(expect.objectContaining({ code: -32000 }))
  })

  it('audit actor is set during tool execution', async () => {
    tools.createFlag.mockImplementation(async () => currentActor())
    const client = await connect()

    const result = await client.callTool({
      name: 'create_flag',
      arguments: { key: 'audited', name: 'Audited', type: 'BOOLEAN' },
    })

    expect(JSON.parse(textOf(result))).toEqual({
      apiKeyId: `key-${VALID_TOKEN}`,
      apiKeyName: `Key ${VALID_TOKEN}`,
    })
  })

  describe('rate limits', () => {
    // Each test gets its own app so the throttler buckets do not couple
    beforeEach(startApp)

    it('limits each token to 120 requests per minute, independent of the per-IP default', async () => {
      const statuses: number[] = []
      for (let i = 0; i < 121; i++) {
        statuses.push((await ping('tkm_rate_a')).status)
      }

      // The global default (100/min per IP) must not apply to /api/mcp
      expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true)
      expect(statuses[120]).toBe(429)

      // Same IP, different token → separate bucket
      expect((await ping('tkm_rate_b')).status).toBe(200)
    })

    it('limits each IP to 600 requests per minute, even with distinct invalid tokens', async () => {
      const statuses: number[] = []
      for (let i = 0; i < 601; i++) {
        statuses.push((await ping(`bogus-${i}-${Math.random()}`)).status)
      }

      expect(statuses.slice(0, 600).every((s) => s === 401)).toBe(true)
      expect(statuses[600]).toBe(429)
      // The IP limit is checked before authentication (no key lookup)
      expect(resolver.resolve).toHaveBeenCalledTimes(600)
    })
  })
})
