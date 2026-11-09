import type { FlagType } from '@/components/flags/FlagValueDialog'

export type { FlagType }

export const FLAG_TYPES: FlagType[] = ['BOOLEAN', 'STRING', 'NUMBER', 'JSON']

export interface ProjectEnvironment {
  id: string
  name: string
  key: string
}

export interface FlagsProject {
  id: string
  name: string
  key: string
  description: string | null
  type: 'SINGLE' | 'MULTI'
  organizationId: string
  organizationName?: string
  /** Ordered by `sortOrder` (API order). */
  environments?: ProjectEnvironment[]
}

/**
 * A brand's value in one environment. Without an own row (`inherited`) the
 * brand carries the environment default's effective values.
 */
export interface BrandFlagValue {
  brandId: string
  brandName: string
  enabled: boolean
  defaultValue: string
  inherited?: boolean
  isBrandSpecific?: boolean
}

export interface FlagEnvironment {
  id: string
  environmentId: string
  environmentName: string
  enabled: boolean
  defaultValue: string
  /** MULTI projects only: every brand's value in this environment. */
  brandValues?: BrandFlagValue[]
}

export interface FeatureFlag {
  id: string
  name: string
  key: string
  description: string | null
  flagType: FlagType
  environments: FlagEnvironment[]
  /** Missing on older API versions; the table shows "–". */
  createdAt?: string
  /** Last change of the flag or any of its values. */
  updatedAt?: string
}

/** Target of the value editor: the environment default or one brand. */
export interface EditingValue {
  flag: FeatureFlag
  env: FlagEnvironment
  brand?: BrandFlagValue
}
