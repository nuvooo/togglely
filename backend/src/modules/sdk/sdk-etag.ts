import { createHash } from 'node:crypto'
import { SDK_ERROR_CODES } from './sdk.constants'
import { SdkAccess } from './sdk.service'
import {
  extractEffectiveBrandKey,
  extractSdkApiKey,
  extractSdkOrigin,
  mapSdkError,
  parseSdkContext,
  setSdkCorsHeaders,
} from './sdk-http.utils'

export interface SdkEtagScope {
  organizationId: string
  projectId: string
  environmentId: string
}

/** Vary for SDK flag responses: the result depends on key and origin. */
export const SDK_FLAGS_VARY = 'Origin, X-API-Key, Authorization'

/**
 * Weak ETag of an SDK flags response: changes whenever the configuration
 * version of the environment changes, and differs per tenant scope
 * (organization, project, environment id: no collisions across tenants or
 * for a re-created environment) and request shape (brand, targeting
 * context, single flag vs. all flags).
 */
export function computeSdkEtag(
  version: number,
  scope: SdkEtagScope,
  brandKey: string | undefined,
  context: Record<string, unknown>,
  flagKey: string | undefined
): string {
  const sortedContext = Object.fromEntries(
    Object.keys(context)
      .sort()
      .map((key) => [key, context[key]])
  )
  const hash = createHash('sha256')
    .update(
      JSON.stringify([
        scope.organizationId,
        scope.projectId,
        scope.environmentId,
        brandKey ?? '',
        sortedContext,
        flagKey ?? '',
      ])
    )
    .digest('hex')
    .slice(0, 16)
  return `W/"${version}-${hash}"`
}

const stripWeak = (tag: string) => tag.trim().replace(/^W\//, '')

/** If-None-Match uses weak comparison (RFC 9110 13.1.2). */
export function etagMatches(
  ifNoneMatch: string | string[] | undefined,
  etag: string
): boolean {
  const header = Array.isArray(ifNoneMatch)
    ? ifNoneMatch.join(',')
    : ifNoneMatch
  if (!header) return false
  if (header.trim() === '*') return true
  const target = stripWeak(etag)
  return header.split(',').some((tag) => stripWeak(tag) === target)
}

export interface SdkFlagsHandlerDeps {
  sdkService: {
    resolveSdkAccess(
      projectKey: string,
      environmentKey: string,
      apiKey: string,
      origin?: string
    ): Promise<SdkAccess>
    evaluateFlagForAccess(
      access: SdkAccess,
      flagKey: string,
      brandKey?: string,
      context?: Record<string, unknown>
    ): Promise<unknown>
    getAllFlagsForAccess(
      access: SdkAccess,
      brandKey?: string,
      context?: Record<string, unknown>
    ): Promise<unknown>
    trackExposuresForAccess(
      access: SdkAccess,
      brandKey: string | undefined,
      context: Record<string, unknown>,
      flagKey?: string
    ): Promise<void>
  }
  changeEvents: {
    getVersion(projectId: string, environmentId: string): Promise<number>
  }
  logger: {
    debug(message: string): void
    error(message: string, ...rest: unknown[]): void
  }
}

/**
 * GET /sdk/flags/:projectKey/:environmentKey[/:flagKey].
 * Order: API key/origin check → version → ETag (304 without evaluating)
 * → evaluation.
 */
export async function handleSdkFlagsRequest(
  deps: SdkFlagsHandlerDeps,
  req: {
    params: Record<string, string>
    query: Record<string, unknown>
    headers: Record<string, string | string[] | undefined>
  },
  res: any,
  flagKey?: string
): Promise<void> {
  const { projectKey, environmentKey } = req.params
  const context = parseSdkContext(req.query)
  const brandKey = extractEffectiveBrandKey(req.query, context)
  const apiKey = extractSdkApiKey(req)
  const origin = extractSdkOrigin(req)
  const route = `/sdk/flags/${projectKey}/${environmentKey}${flagKey ? `/${flagKey}` : ''}`

  // Always set CORS headers first
  setSdkCorsHeaders(res, origin)
  deps.logger.debug(
    `[SDK] Request: ${route} (API key present: ${!!apiKey}, Origin: ${origin || 'none'})`
  )

  try {
    if (!apiKey) {
      res.status(401).json({
        error: 'API key required',
        code: SDK_ERROR_CODES.missingApiKey,
      })
      return
    }

    const access = await deps.sdkService.resolveSdkAccess(
      projectKey,
      environmentKey,
      apiKey,
      origin
    )

    const version = await deps.changeEvents.getVersion(
      access.project.id,
      access.environment.id
    )
    const etag = computeSdkEtag(
      version,
      {
        organizationId: access.organizationId,
        projectId: access.project.id,
        environmentId: access.environment.id,
      },
      brandKey,
      context,
      flagKey
    )
    res.setHeader('ETag', etag)
    // Shared caches must never serve one key's response to another
    res.setHeader('Cache-Control', 'private, no-cache')
    res.setHeader('Vary', SDK_FLAGS_VARY)

    if (etagMatches(req.headers['if-none-match'], etag)) {
      // Not evaluated, but experiment exposures still count
      deps.sdkService
        .trackExposuresForAccess(access, brandKey, context, flagKey)
        .catch((error: unknown) =>
          deps.logger.error(
            `[SDK] Exposure tracking failed for ${route}: ${String(error)}`
          )
        )
      res.status(304).end()
      return
    }

    const result = flagKey
      ? await deps.sdkService.evaluateFlagForAccess(
          access,
          flagKey,
          brandKey,
          context
        )
      : await deps.sdkService.getAllFlagsForAccess(access, brandKey, context)

    res.json(result)
  } catch (error: any) {
    deps.logger.error(`[SDK] Error for ${route}:`, error?.message)
    // An error response must never be cached under a valid ETag
    res.removeHeader?.('ETag')
    const response = mapSdkError(error)
    res.status(response.status).json(response.body)
  }
}
