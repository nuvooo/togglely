import { createHmac } from 'node:crypto'
import {
  generateWebhookSecret,
  maskSecret,
  signWebhook,
} from './webhook-signer'

describe('signWebhook', () => {
  it('matches the known test vector', () => {
    expect(
      signWebhook('whsec_dGVzdC1zZWNyZXQ', 1700000000, '{"id":"evt_1"}')
    ).toBe(
      't=1700000000,v1=eb5fe938fb8032ebc3b173fd6da0b142e9ce58f641aa61b9c692895ca0dea90e'
    )
  })

  it('can be verified by a receiver with the documented recipe', () => {
    const secret = generateWebhookSecret()
    const body = JSON.stringify({ id: 'evt_2', type: 'webhook.test' })
    const header = signWebhook(secret, 1731150000, body)
    const [t, v1] = header.split(',').map((part) => part.split('=')[1])
    const expected = createHmac('sha256', secret)
      .update(`${t}.${body}`)
      .digest('hex')
    expect(v1).toBe(expected)
  })
})

describe('generateWebhookSecret', () => {
  it('returns whsec_ + 32 random bytes as base64url', () => {
    const secret = generateWebhookSecret()
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(secret.slice(6), 'base64url')).toHaveLength(32)
    expect(generateWebhookSecret()).not.toBe(secret)
  })
})

describe('maskSecret', () => {
  it('only reveals the prefix and the last four characters', () => {
    expect(maskSecret('whsec_abcdefghijklmnopqrstuvwxyz')).toBe('whsec_…wxyz')
  })

  it('never leaks short secrets', () => {
    expect(maskSecret('whsec_ab')).toBe('whsec_…')
    expect(maskSecret('')).toBe('whsec_…')
  })
})
