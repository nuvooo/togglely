import type { FlagType } from '@/lib/targeting-rules'

export type { FlagType }

/** Tabs of the flag detail page; the active one lives in `?tab=`. */
export const FLAG_TABS = [
  'environments',
  'targeting',
  'brands',
  'history',
] as const
export type FlagTab = (typeof FLAG_TABS)[number]

export const isFlagTab = (value: string | null): value is FlagTab =>
  (FLAG_TABS as readonly string[]).includes(value ?? '')

export interface FlagDetail {
  id: string
  name: string
  key: string
  description: string | null
  type: FlagType
  projectId: string
}

/** Default (brand-less) state of the flag in one environment. */
export interface EnvironmentState {
  /** Environment id. */
  id: string
  name: string
  isEnabled: boolean
  /** Stored value as string ("true", "42", '{"a":1}' …). */
  value: string
}

/**
 * A brand's value in one environment. Without an own row (`inherited`) the
 * brand carries the environment default's effective values.
 */
export interface BrandValue {
  brandId: string
  brandName: string
  enabled: boolean
  value: string
  inherited: boolean
}

/** One environment of a MULTI project with all brand values. */
export interface BrandEnvironment {
  environmentId: string
  environmentName: string
  enabled: boolean
  value: string
  brands: BrandValue[]
}

/** Valid MongoDB ObjectId (24 hex chars). */
export const isValidObjectId = (id: string | undefined | null): id is string =>
  typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)

/** Untyped API payload, normalized by the functions below. */
// biome-ignore lint/suspicious/noExplicitAny: raw API payload
export type RawApi = any

export const valueToString = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

// The API returns `flagType` (GET /feature-flags/:id); normalize to the page model.
export const normalizeFlag = (raw: RawApi): FlagDetail => ({
  id: raw.id,
  name: raw.name ?? '',
  key: raw.key ?? '',
  description: raw.description ?? null,
  type: raw.flagType ?? raw.type ?? 'BOOLEAN',
  projectId: raw.projectId,
})

// GET /feature-flags/:id/environments returns `enabled` + `defaultValue`.
export const normalizeEnvironments = (
  raw: RawApi[] | undefined
): EnvironmentState[] =>
  (raw ?? []).map((env) => ({
    id: env.id,
    name: env.name,
    isEnabled: Boolean(env.enabled ?? env.isEnabled),
    value: valueToString(env.defaultValue),
  }))

// One flag of GET /projects/:id/flags-with-brands.
export const normalizeBrandEnvironments = (
  rawFlag: RawApi
): BrandEnvironment[] =>
  (rawFlag?.environments ?? []).map((env: RawApi) => ({
    environmentId: env.environmentId,
    environmentName: env.environmentName,
    enabled: Boolean(env.enabled),
    value: valueToString(env.defaultValue),
    brands: (env.brandValues ?? []).map((b: RawApi) => ({
      brandId: b.brandId,
      brandName: b.brandName,
      enabled: Boolean(b.enabled),
      value: valueToString(b.defaultValue ?? b.value),
      inherited: b.inherited ?? false,
    })),
  }))
