import axios from 'axios'

export type SdkContext = Record<string, string | number | boolean>

export interface SdkFlagResult {
  value: unknown
  enabled: boolean
  flagType: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'
}

// The public SDK routes live at /sdk (not /api) and authenticate with an
// API key only. A separate client keeps the dashboard's JWT interceptor
// (Authorization: Bearer <jwt>) away from these requests.
const sdkHttp = axios.create()

/** Evaluates all flags of a project/environment exactly like an SDK would. */
export async function fetchSdkFlags(options: {
  projectKey: string
  environmentKey: string
  apiKey: string
  context: SdkContext
  /** Brand of a multi-brand project; omitted = environment defaults. */
  brandKey?: string
}): Promise<Record<string, SdkFlagResult>> {
  const { projectKey, environmentKey, apiKey, context, brandKey } = options
  const params: Record<string, string> = {}
  if (brandKey) params.brandKey = brandKey
  if (Object.keys(context).length > 0) params.context = JSON.stringify(context)
  try {
    const response = await sdkHttp.get(
      `/sdk/flags/${encodeURIComponent(projectKey)}/${encodeURIComponent(environmentKey)}`,
      { headers: { 'X-API-Key': apiKey }, params }
    )
    return response.data
  } catch (err: any) {
    const message =
      err?.response?.data?.error ??
      (err?.response?.status ? `HTTP ${err.response.status}` : err?.message) ??
      'Request failed'
    throw new Error(message)
  }
}

export interface BrandColumn {
  /** `null` = environment defaults (request without brand). */
  key: string | null
  label: string
}

export interface BrandMatrixRow {
  flagKey: string
  flagType: SdkFlagResult['flagType']
  /** Keyed by brand key, `default` for the column without brand. */
  cells: Record<string, SdkFlagResult | undefined>
}

export const DEFAULT_COLUMN = 'default'

/**
 * Evaluates a multi-brand project for the defaults and every brand (one SDK
 * request each, like one app per brand would) and pivots the result per flag.
 * A failing brand is reported in `errors` instead of failing the whole run.
 */
export async function fetchBrandMatrix(options: {
  projectKey: string
  environmentKey: string
  apiKey: string
  context: SdkContext
  brands: { key: string; name: string }[]
}): Promise<{
  columns: BrandColumn[]
  rows: BrandMatrixRow[]
  errors: Record<string, string>
}> {
  const { brands, ...request } = options
  const columns: BrandColumn[] = [
    { key: null, label: 'Default' },
    ...brands.map((b) => ({ key: b.key, label: b.name })),
  ]

  const responses = await Promise.allSettled(
    columns.map((c) => fetchSdkFlags({ ...request, brandKey: c.key ?? undefined }))
  )

  const rows = new Map<string, BrandMatrixRow>()
  const errors: Record<string, string> = {}
  responses.forEach((response, index) => {
    const column = columns[index].key ?? DEFAULT_COLUMN
    if (response.status === 'rejected') {
      errors[column] =
        response.reason instanceof Error ? response.reason.message : 'Request failed'
      return
    }
    for (const [flagKey, result] of Object.entries(response.value)) {
      const row = rows.get(flagKey) ?? { flagKey, flagType: result.flagType, cells: {} }
      row.cells[column] = result
      rows.set(flagKey, row)
    }
  })

  return { columns, rows: [...rows.values()], errors }
}

/** Generates copy-pasteable SDK code for the selected project and flag. */
export function buildSdkSnippet(options: {
  apiKey: string
  projectKey: string
  environmentKey: string
  baseUrl: string
  context: SdkContext
  flag: { key: string; flagType: SdkFlagResult['flagType'] } | null
  /** The SDK client sends `context.brandKey` as the brand of the request. */
  brandKey?: string
}): string {
  const { apiKey, projectKey, environmentKey, baseUrl, flag, brandKey } = options
  const context = brandKey ? { brandKey, ...options.context } : options.context
  const key = flag?.key ?? 'your-flag-key'
  const usage = (() => {
    switch (flag?.flagType) {
      case 'STRING':
        return `const value = await client.getString('${key}', '');`
      case 'NUMBER':
        return `const value = await client.getNumber('${key}', 0);`
      case 'JSON':
        return `const value = await client.getValue('${key}');`
      default:
        return `const value = await client.isEnabled('${key}', false);`
    }
  })()

  return `import { TogglelyClient } from '@togglely/sdk-core';

const client = new TogglelyClient({
  apiKey: '${apiKey || 'YOUR_API_KEY'}',
  project: '${projectKey}',
  environment: '${environmentKey}',
  baseUrl: '${baseUrl}'
});

// Context used by targeting rules
client.setContext(${JSON.stringify(context, null, 2)});

${usage}
console.log('${key}:', value);`
}
