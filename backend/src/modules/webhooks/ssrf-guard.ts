import { promises as dns } from 'node:dns'
import { isIP, isIPv4, isIPv6 } from 'node:net'

/**
 * SSRF protection for webhook targets. Webhook URLs are user input, so
 * deliveries must never reach loopback, private networks or cloud metadata
 * endpoints unless the operator explicitly allows it
 * (WEBHOOK_ALLOW_PRIVATE=true, e.g. for self-hosted receivers in the LAN).
 */

export type WebhookUrlErrorCode =
  | 'invalid_url'
  | 'insecure_scheme'
  | 'credentials_in_url'
  | 'blocked_private_address'
  | 'dns_error'

export class WebhookUrlError extends Error {
  constructor(
    readonly code: WebhookUrlErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'WebhookUrlError'
  }
}

export interface UrlPolicy {
  allowPrivate: boolean
  allowInsecure: boolean
}

/** Reads the URL policy from the environment (evaluated per call). */
export function webhookUrlPolicy(
  env: NodeJS.ProcessEnv = process.env
): UrlPolicy {
  return {
    allowPrivate: env.WEBHOOK_ALLOW_PRIVATE === 'true',
    allowInsecure: env.WEBHOOK_ALLOW_INSECURE === 'true',
  }
}

/** [network, prefix length] in 32-bit integer form. */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]

function v4ToInt(address: string): number {
  return (
    address
      .split('.')
      .reduce((acc, part) => acc * 256 + Number.parseInt(part, 10), 0) >>> 0
  )
}

const BLOCKED_V4_RANGES = BLOCKED_V4.map(([network, bits]) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return { network: (v4ToInt(network) & mask) >>> 0, mask }
})

function isBlockedV4Int(value: number): boolean {
  return BLOCKED_V4_RANGES.some(
    ({ network, mask }) => (value & mask) >>> 0 === network
  )
}

/** Expands an IPv6 address (optionally with embedded IPv4) into 8 hextets. */
function parseIPv6(address: string): number[] | null {
  let input = address.toLowerCase()
  const zone = input.indexOf('%')
  if (zone !== -1) input = input.slice(0, zone)

  // Embedded dotted IPv4 tail (e.g. ::ffff:10.0.0.1)
  const lastColon = input.lastIndexOf(':')
  const tail = input.slice(lastColon + 1)
  if (tail.includes('.')) {
    if (!isIPv4(tail)) return null
    const v4 = v4ToInt(tail)
    input = `${input.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(
      v4 & 0xffff
    ).toString(16)}`
  }

  const halves = input.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) =>
    part === '' ? [] : part.split(':').map((h) => Number.parseInt(h, 16))
  const head = parse(halves[0])
  const rest = halves.length === 2 ? parse(halves[1]) : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 && head.length !== 8) return null
  if (missing < 0) return null
  const hextets = [
    ...head,
    ...new Array(halves.length === 2 ? missing : 0).fill(0),
    ...rest,
  ]
  if (
    hextets.length !== 8 ||
    hextets.some((h) => Number.isNaN(h) || h < 0 || h > 0xffff)
  ) {
    return null
  }
  return hextets
}

function embeddedV4(h: number[], offset: number): number {
  return ((h[offset] << 16) | h[offset + 1]) >>> 0
}

function isBlockedV6(h: number[]): boolean {
  const allZeroUntil = (n: number) => h.slice(0, n).every((x) => x === 0)

  // ::/96 covers ::, ::1 and deprecated IPv4-compatible addresses
  if (allZeroUntil(6)) return true
  // IPv4-mapped ::ffff:0:0/96 → judge the embedded IPv4 address
  if (allZeroUntil(5) && h[5] === 0xffff)
    return isBlockedV4Int(embeddedV4(h, 6))
  // IPv4-translated ::ffff:0:0:0/96
  if (allZeroUntil(4) && h[4] === 0xffff && h[5] === 0) return true
  // NAT64 64:ff9b::/96 → embedded IPv4
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) {
    return isBlockedV4Int(embeddedV4(h, 6))
  }
  // Local-use NAT64 64:ff9b:1::/48
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 1) return true
  // 6to4 2002::/16 → embedded IPv4 in bits 16..48
  if (h[0] === 0x2002) return isBlockedV4Int(embeddedV4(h, 1))
  // Discard-only 100::/64
  if (h[0] === 0x100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true
  // Teredo 2001::/32: tunnels to an (obfuscated) embedded IPv4 address
  if (h[0] === 0x2001 && h[1] === 0) return true
  // Documentation 2001:db8::/32
  if (h[0] === 0x2001 && h[1] === 0xdb8) return true
  // Unique local fc00::/7
  if ((h[0] & 0xfe00) === 0xfc00) return true
  // Link-local fe80::/10 and deprecated site-local fec0::/10
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return true
  // Multicast ff00::/8
  if ((h[0] & 0xff00) === 0xff00) return true
  return false
}

/**
 * True for addresses a webhook must never be delivered to (private,
 * loopback, link-local, CGNAT, multicast, reserved, IPv4-mapped variants).
 * Anything that is not a valid IP address is treated as blocked.
 */
export function isBlockedAddress(address: string): boolean {
  const ip = stripBrackets(address)
  if (isIPv4(ip)) return isBlockedV4Int(v4ToInt(ip))
  if (isIPv6(ip)) {
    const hextets = parseIPv6(ip)
    return hextets ? isBlockedV6(hextets) : true
  }
  return true
}

/** `localhost` and `*.localhost` (RFC 6761) always resolve to loopback. */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === 'localhost' || host.endsWith('.localhost')
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/**
 * Static URL checks (no DNS): scheme, credentials, literal private
 * addresses and localhost. The WHATWG URL parser already normalizes
 * shorthand IPv4 forms (`127.1`, `0x7f000001`, `2130706433`).
 */
export function assertPublicUrl(raw: string, policy: UrlPolicy): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new WebhookUrlError('invalid_url', 'Invalid URL')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new WebhookUrlError('insecure_scheme', 'Only https URLs are allowed')
  }
  if (url.protocol === 'http:' && !policy.allowInsecure) {
    throw new WebhookUrlError(
      'insecure_scheme',
      'Only https URLs are allowed (set WEBHOOK_ALLOW_INSECURE=true to allow http)'
    )
  }
  if (!url.hostname) {
    throw new WebhookUrlError('invalid_url', 'Invalid URL')
  }
  if (url.username || url.password) {
    throw new WebhookUrlError(
      'credentials_in_url',
      'Credentials in the URL are not allowed'
    )
  }

  if (!policy.allowPrivate) {
    const host = stripBrackets(url.hostname)
    if (isBlockedHostname(host) || (isIP(host) && isBlockedAddress(host))) {
      throw new WebhookUrlError(
        'blocked_private_address',
        'Private, loopback and link-local targets are not allowed'
      )
    }
  }
  return url
}

export interface ResolvedAddress {
  address: string
  family: 4 | 6
}

export type LookupAllFn = (
  hostname: string,
  options: { all: true; verbatim: boolean }
) => Promise<Array<{ address: string; family: number }>>

const defaultLookup: LookupAllFn = (hostname, options) =>
  dns.lookup(hostname, options)

/** Max. time for the DNS lookup of a webhook host. */
export const DNS_TIMEOUT_MS = 5_000

/** Rejects with `dns_error` when the lookup does not settle in time. */
function lookupWithTimeout(
  lookup: LookupAllFn,
  host: string
): Promise<Array<{ address: string; family: number }>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new WebhookUrlError('dns_error', 'DNS lookup failed (ETIMEOUT)')
        ),
      DNS_TIMEOUT_MS
    )
    timer.unref?.()
  })
  return Promise.race([
    lookup(host, { all: true, verbatim: true }),
    timeout,
  ]).finally(() => clearTimeout(timer))
}

/**
 * Resolves the hostname and validates every returned address. The returned
 * address is the one the connection gets pinned to, so a second DNS answer
 * (DNS rebinding) cannot redirect the request.
 */
export async function resolvePublicAddress(
  hostname: string,
  options: { allowPrivate: boolean; lookup?: LookupAllFn }
): Promise<ResolvedAddress> {
  const host = stripBrackets(hostname)
  const blocked = () =>
    new WebhookUrlError(
      'blocked_private_address',
      'Target resolves to a private, loopback or link-local address'
    )

  const literal = isIP(host)
  if (literal) {
    if (!options.allowPrivate && isBlockedAddress(host)) throw blocked()
    return { address: host, family: literal as 4 | 6 }
  }
  if (!options.allowPrivate && isBlockedHostname(host)) throw blocked()

  let records: Array<{ address: string; family: number }>
  try {
    records = await lookupWithTimeout(options.lookup ?? defaultLookup, host)
  } catch (error) {
    if (error instanceof WebhookUrlError) throw error
    const code = (error as { code?: string })?.code ?? 'unknown'
    throw new WebhookUrlError('dns_error', `DNS lookup failed (${code})`)
  }
  if (!records.length) {
    throw new WebhookUrlError('dns_error', 'DNS lookup returned no addresses')
  }
  if (
    !options.allowPrivate &&
    records.some((r) => isBlockedAddress(r.address))
  ) {
    throw blocked()
  }
  const first = records[0]
  return { address: first.address, family: first.family === 6 ? 6 : 4 }
}
