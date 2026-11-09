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
}): Promise<Record<string, SdkFlagResult>> {
  const { projectKey, environmentKey, apiKey, context } = options
  try {
    const response = await sdkHttp.get(
      `/sdk/flags/${encodeURIComponent(projectKey)}/${encodeURIComponent(environmentKey)}`,
      {
        headers: { 'X-API-Key': apiKey },
        params: Object.keys(context).length > 0 ? { context: JSON.stringify(context) } : {},
      }
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

/** Generates copy-pasteable SDK code for the selected project and flag. */
export function buildSdkSnippet(options: {
  apiKey: string
  projectKey: string
  environmentKey: string
  baseUrl: string
  context: SdkContext
  flag: { key: string; flagType: SdkFlagResult['flagType'] } | null
}): string {
  const { apiKey, projectKey, environmentKey, baseUrl, context, flag } = options
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
