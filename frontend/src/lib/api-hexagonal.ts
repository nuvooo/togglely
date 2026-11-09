/**
 * Hexagonal Architecture API Client
 * Typed API functions for the new clean architecture endpoints
 */

import api from './api'

// ============ Types ============

export type FlagType = 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'

export interface Flag {
  id: string
  key: string
  name: string
  description: string | null
  type: FlagType
  projectId: string
  createdAt: string
  updatedAt: string
}

export interface FlagValue {
  id: string
  flagId: string
  environmentId: string
  brandId: string | null
  enabled: boolean
  value: string
}

export interface Project {
  id: string
  name: string
  key: string
  description: string | null
  type: 'SINGLE' | 'MULTI'
  allowedOrigins: string[]
  organizationId: string
  createdAt: string
  updatedAt: string
}

export interface Brand {
  id: string
  name: string
  key: string
  description: string | null
  projectId: string
}

export interface FlagEvaluation {
  value: unknown
  enabled: boolean
  flagType: string
}

export interface CreateFlagInput {
  key: string
  name: string
  description?: string
  type: FlagType
  initialValues?: Record<string, { enabled: boolean; value: string }>
}

export interface UpdateFlagInput {
  name?: string
  description?: string | null
}

export interface UpdateFlagValueInput {
  enabled?: boolean
  value?: string
  brandId?: string | null
}

export interface CreateProjectInput {
  name: string
  key: string
  description?: string
  type?: 'SINGLE' | 'MULTI'
  allowedOrigins?: string[]
}

// ============ Feature Flag API ============

/**
 * Create a new feature flag
 * POST /feature-flags/project/:projectId
 */
export async function createFlag(
  projectId: string,
  input: CreateFlagInput
): Promise<{ flag: Flag; values: FlagValue[] }> {
  const response = await api.post(`/feature-flags/project/${projectId}`, {
    ...input,
    flagType: input.type, // backward compatibility
  })
  return response.data
}

/**
 * Update a feature flag
 * PATCH /feature-flags/:flagId
 */
export async function updateFlag(
  flagId: string,
  input: UpdateFlagInput
): Promise<Flag> {
  const response = await api.patch(`/feature-flags/${flagId}`, input)
  return response.data
}

/**
 * Delete a feature flag
 * DELETE /feature-flags/:flagId
 */
export async function deleteFlag(flagId: string): Promise<void> {
  await api.delete(`/feature-flags/${flagId}`)
}

/**
 * Update flag value (default or brand-specific)
 * PATCH /feature-flags/:flagId/environments/:environmentId/value
 */
export async function updateFlagValue(
  flagId: string,
  environmentId: string,
  input: UpdateFlagValueInput
): Promise<FlagValue> {
  const response = await api.patch(
    `/feature-flags/${flagId}/environments/${environmentId}/value`,
    input
  )
  return response.data
}

/**
 * Toggle flag in one environment
 * POST /feature-flags/:flagId/toggle
 */
export async function toggleFlag(
  flagId: string,
  environmentId: string,
  enabled: boolean
): Promise<void> {
  await api.post(`/feature-flags/${flagId}/toggle`, { environmentId, enabled })
}

// ============ Project API ============

/**
 * Get all projects for current user
 * GET /projects
 */
export async function getProjects(): Promise<Project[]> {
  const response = await api.get('/projects')
  return response.data.projects || response.data
}

/**
 * Create a new project
 * POST /projects/organization/:orgId
 */
export async function createProject(
  orgId: string,
  input: CreateProjectInput
): Promise<Project> {
  const response = await api.post(`/projects/organization/${orgId}`, input)
  return response.data.project || response.data
}

/**
 * Delete a project
 * DELETE /projects/:projectId
 */
export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${projectId}`)
}

/**
 * Get project with flags and brand values
 * GET /projects/:projectId/flags-with-brands
 */
export async function getProjectFlagsWithBrands(projectId: string): Promise<{
  flags: Array<{
    id: string
    name: string
    key: string
    type: FlagType
    environments: Array<{
      environmentId: string
      environmentName: string
      enabled: boolean
      defaultValue: string
      brandValues?: Array<{
        brandId: string
        brandName: string
        enabled: boolean
        value: string
      }>
    }>
  }>
}> {
  const response = await api.get(`/projects/${projectId}/flags-with-brands`)
  return response.data
}

// ============ Brand API ============

/**
 * Get all flags for a brand
 * GET /brands/:brandId/flags
 */
export async function getBrandFlags(brandId: string): Promise<{
  brand: Brand
  flags: Array<{
    id: string
    name: string
    key: string
    flagType: FlagType
    environments: Array<{
      id: string
      environmentId: string
      environmentName: string
      enabled: boolean
      defaultValue: string
      isBrandSpecific: boolean
    }>
  }>
}> {
  const response = await api.get(`/brands/${brandId}/flags`)
  return response.data
}

/**
 * Toggle brand-specific flag
 * POST /brands/:brandId/flags/:flagId/toggle
 */
export async function toggleBrandFlag(
  brandId: string,
  flagId: string,
  environmentId: string,
  enabled: boolean
): Promise<void> {
  await api.post(`/brands/${brandId}/flags/${flagId}/toggle`, {
    environmentId,
    enabled,
  })
}

/**
 * Update brand-specific flag value
 * PATCH /feature-flags/:flagId/environments/:environmentId/value
 */
export async function updateBrandFlagValue(
  brandId: string,
  flagId: string,
  environmentId: string,
  defaultValue: string
): Promise<void> {
  await api.patch(
    `/feature-flags/${flagId}/environments/${environmentId}/value`,
    { value: defaultValue, brandId }
  )
}

// ============ SDK API (for testing) ============

/**
 * Evaluate a flag via SDK
 * GET /sdk/:projectKey/:environmentKey/:flagKey
 */
export async function evaluateFlag(
  projectKey: string,
  environmentKey: string,
  flagKey: string,
  options?: {
    brandKey?: string
    context?: Record<string, unknown>
  }
): Promise<FlagEvaluation> {
  const params = new URLSearchParams()
  if (options?.brandKey) params.append('brandKey', options.brandKey)

  const response = await api.get(
    `/sdk/${projectKey}/${environmentKey}/${flagKey}?${params.toString()}`,
    {
      headers: options?.context
        ? { 'X-Context': JSON.stringify(options.context) }
        : undefined,
    }
  )
  return response.data
}

// ============ Export all ============

export const hexagonalApi = {
  // Flags
  createFlag,
  updateFlag,
  deleteFlag,
  updateFlagValue,
  toggleFlag,

  // Projects
  getProjects,
  createProject,
  deleteProject,
  getProjectFlagsWithBrands,

  // Brands
  getBrandFlags,
  toggleBrandFlag,
  updateBrandFlagValue,

  // SDK
  evaluateFlag,
}

export default hexagonalApi
