import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http'
import { AddressInfo } from 'node:net'
import { sendWebhookRequest } from './webhook-http'

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void

describe('sendWebhookRequest', () => {
  let server: Server
  let port: number
  let handler: Handler
  const received: Array<{ headers: IncomingMessage['headers']; body: string }> =
    []

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        received.push({ headers: req.headers, body })
        handler(req, res, body)
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    received.length = 0
    handler = (_req, res) => {
      res.writeHead(200).end('ok')
    }
  })

  const open = { allowPrivate: true, allowInsecure: true }

  it('POSTs the body with the given headers and reports success', async () => {
    const result = await sendWebhookRequest({
      url: `http://127.0.0.1:${port}/hook`,
      body: '{"a":1}',
      headers: { 'Content-Type': 'application/json', 'X-Test': 'yes' },
      policy: open,
    })
    expect(result).toMatchObject({
      ok: true,
      responseCode: 200,
      responseBody: 'ok',
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(received[0].body).toBe('{"a":1}')
    expect(received[0].headers['x-test']).toBe('yes')
  })

  it('pins the connection to the pre-resolved address', async () => {
    const lookup = jest
      .fn()
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const result = await sendWebhookRequest({
      // Does not resolve via real DNS; only the pinned address can be used
      url: `http://pinned.invalid:${port}/hook`,
      body: '{}',
      headers: {},
      policy: open,
      lookup,
    })
    expect(result.ok).toBe(true)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(received[0].headers.host).toBe(`pinned.invalid:${port}`)
  })

  it('treats non-2xx responses as failure and stores at most 1 KB of the body', async () => {
    handler = (_req, res) => {
      res.writeHead(500).end('x'.repeat(5000))
    }
    const result = await sendWebhookRequest({
      url: `http://127.0.0.1:${port}/hook`,
      body: '{}',
      headers: {},
      policy: open,
    })
    expect(result.ok).toBe(false)
    expect(result.responseCode).toBe(500)
    expect(result.error).toBe('unexpected_status')
    expect(result.responseBody).toHaveLength(1024)
  })

  it('does not follow redirects', async () => {
    handler = (_req, res) => {
      res.writeHead(302, { Location: 'http://169.254.169.254/' }).end()
    }
    const result = await sendWebhookRequest({
      url: `http://127.0.0.1:${port}/hook`,
      body: '{}',
      headers: {},
      policy: open,
    })
    expect(result).toMatchObject({
      ok: false,
      responseCode: 302,
      error: 'redirect_not_followed',
    })
    expect(received).toHaveLength(1)
  })

  it('aborts after the timeout', async () => {
    handler = () => {
      // never responds
    }
    const result = await sendWebhookRequest({
      url: `http://127.0.0.1:${port}/hook`,
      body: '{}',
      headers: {},
      policy: open,
      timeoutMs: 200,
    })
    expect(result).toMatchObject({ ok: false, error: 'timeout' })
  })

  it('blocks private targets without sending anything', async () => {
    const result = await sendWebhookRequest({
      url: `http://127.0.0.1:${port}/hook`,
      body: '{}',
      headers: {},
      policy: { allowPrivate: false, allowInsecure: true },
    })
    expect(result).toMatchObject({
      ok: false,
      error: 'blocked_private_address',
    })
    expect(received).toHaveLength(0)
  })

  it('blocks hostnames resolving to private addresses (rebinding)', async () => {
    const lookup = jest
      .fn()
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const result = await sendWebhookRequest({
      url: `http://rebind.example:${port}/hook`,
      body: '{}',
      headers: {},
      policy: { allowPrivate: false, allowInsecure: true },
      lookup,
    })
    expect(result).toMatchObject({
      ok: false,
      error: 'blocked_private_address',
    })
    expect(received).toHaveLength(0)
  })

  it('rejects http when insecure URLs are not allowed', async () => {
    const result = await sendWebhookRequest({
      url: `http://127.0.0.1:${port}/hook`,
      body: '{}',
      headers: {},
      policy: { allowPrivate: true, allowInsecure: false },
    })
    expect(result).toMatchObject({ ok: false, error: 'insecure_scheme' })
  })

  it('reports connection failures', async () => {
    const closed = createServer()
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve))
    const closedPort = (closed.address() as AddressInfo).port
    await new Promise((resolve) => closed.close(resolve))

    const result = await sendWebhookRequest({
      url: `http://127.0.0.1:${closedPort}/hook`,
      body: '{}',
      headers: {},
      policy: open,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^connection_failed/)
  })
})
