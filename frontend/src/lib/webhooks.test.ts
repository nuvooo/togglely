import { createHmac, timingSafeEqual } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import {
  deliveryErrorLabel,
  etagSnippet,
  eventSourceSnippet,
  SIGNATURE_SNIPPET,
  serverStreamSnippet,
  streamUrl,
  webhookErrorMessage,
} from './webhooks'

const axiosError = (status: number, data: unknown) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  response: { status, data },
})

describe('webhook helpers', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('de')
  })

  it.each([
    ['blocked_private_address', /private oder interne adressen/i],
    ['insecure_scheme', /https/i],
    ['credentials_in_url', /benutzernamen/i],
    ['invalid_url', /keine gültige url/i],
    ['webhook_limit_reached', /maximale anzahl/i],
    ['environment_not_in_project', /gehört nicht zu diesem projekt/i],
  ])('maps API code %s to a friendly message', (code, expected) => {
    const message = webhookErrorMessage(axiosError(400, { message: 'raw', code }), i18n.t)
    expect(message).toMatch(expected)
    expect(message).not.toBe('raw')
  })

  it('falls back to the server message for unknown codes', () => {
    expect(webhookErrorMessage(axiosError(400, { message: 'url must be a URL' }), i18n.t)).toBe('url must be a URL')
  })

  it('maps conflicts and rate limits', () => {
    expect(webhookErrorMessage(axiosError(403, { message: 'x' }), i18n.t)).toMatch(/keine berechtigung/i)
    expect(webhookErrorMessage(axiosError(409, { message: 'x' }), i18n.t)).toMatch(/gerade gesendet/i)
    expect(webhookErrorMessage(axiosError(429, { message: 'x' }), i18n.t)).toMatch(/zu viele/i)
  })

  it('labels delivery errors incl. connection codes', () => {
    expect(deliveryErrorLabel(null, i18n.t)).toBeNull()
    expect(deliveryErrorLabel('timeout', i18n.t)).toBe('Zeitüberschreitung (10 s)')
    expect(deliveryErrorLabel('connection_failed: ECONNREFUSED', i18n.t)).toBe(
      'Verbindung fehlgeschlagen (ECONNREFUSED)'
    )
    expect(deliveryErrorLabel('something_new', i18n.t)).toBe('something_new')
  })

  it('uses plural forms for the failure counter', () => {
    expect(i18n.t('webhooks.status.failures', { count: 1 })).toBe('1 Fehlschlag in Folge')
    expect(i18n.t('webhooks.status.failures', { count: 7 })).toBe('7 Fehlschläge in Folge')
  })

  it('builds stream and polling snippets', () => {
    expect(streamUrl('https://flags.example.com', 'shop', 'prod')).toBe('https://flags.example.com/sdk/stream/shop/prod')
    expect(eventSourceSnippet('https://x.io', 'shop', 'prod')).toContain(
      "new EventSource(\n  'https://x.io/sdk/stream/shop/prod?apiKey=YOUR_CLIENT_API_KEY'"
    )
    expect(eventSourceSnippet('https://x.io', 'shop', 'prod')).toMatch(/CLIENT key only/)
    const server = serverStreamSnippet('https://x.io', 'shop', 'prod')
    expect(server).toContain("'X-API-Key': process.env.TOGGLELY_API_KEY")
    expect(server).toContain("fetch('https://x.io/sdk/stream/shop/prod'")
    expect(server).not.toContain('apiKey=')
    const curl = etagSnippet('https://x.io', 'shop', 'prod')
    expect(curl).toContain('If-None-Match')
    expect(curl).toContain('https://x.io/sdk/flags/shop/prod')
  })

  it('ships a verification snippet that accepts valid and rejects forged signatures', () => {
    // Evaluate the snippet as a module body with Node's crypto injected
    const body = SIGNATURE_SNIPPET.replace("import crypto from 'node:crypto'", '').replace('export function', 'function')
    const verify = new Function('crypto', 'Buffer', `${body}\nreturn verifyTogglelySignature`)(
      { createHmac, timingSafeEqual },
      Buffer
    ) as (raw: string, header: string, secret: string) => boolean
    const secret = 'whsec_test'
    const raw = '{"id":"evt_1"}'
    const t = Math.floor(Date.now() / 1000)
    const v1 = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
    expect(verify(raw, `t=${t},v1=${v1}`, secret)).toBe(true)
    expect(verify(raw, `t=${t},v1=${'0'.repeat(64)}`, secret)).toBe(false)
    expect(verify(`${raw} `, `t=${t},v1=${v1}`, secret)).toBe(false)
    const old = t - 600
    const oldSig = createHmac('sha256', secret).update(`${old}.${raw}`).digest('hex')
    expect(verify(raw, `t=${old},v1=${oldSig}`, secret)).toBe(false)
  })
})
