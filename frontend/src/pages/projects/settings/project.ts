import api from '@/lib/axios'
import { useWorkspace } from '@/lib/workspace'

export type ProjectType = 'SINGLE' | 'MULTI'

export interface ProjectEnvironmentRow {
  id: string
  name: string
  key: string
}

/** `GET /projects/:id` */
export interface ProjectDetails {
  id: string
  name: string
  key: string
  description: string | null
  type: ProjectType
  allowedOrigins: string[]
  organizationId: string
  environments?: ProjectEnvironmentRow[]
}

export async function fetchProject(projectId: string): Promise<ProjectDetails> {
  const response = await api.get(`/projects/${projectId}`)
  return response.data.project
}

/** Turns a display name into a key (`My Brand` → `my-brand`). */
export function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Keeps only characters allowed in keys while the user types. */
export function sanitizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '')
}

/** Message of a failed API call (`message` of Nest errors, `error` of older handlers). */
export function apiMessage(error: unknown, fallback: string): string {
  const data = (
    error as { response?: { data?: { message?: unknown; error?: unknown } } }
  )?.response?.data
  const message = data?.message
  if (Array.isArray(message) && message.length > 0) return message.join(', ')
  if (typeof message === 'string' && message) return message
  if (typeof data?.error === 'string' && data.error) return data.error
  return fallback
}

/**
 * Project structure (environments, brands, settings, deletion) may be changed by
 * ADMIN+ of the project's organization. `roleLoading` is true until the role is known.
 */
export function useCanManageProject(projectId: string): {
  canManage: boolean
  roleLoading: boolean
  organizationId: string | undefined
} {
  const { projects, organizations, isLoading } = useWorkspace()
  const organizationId = projects.find(
    (p) => p.id === projectId
  )?.organizationId
  const role = organizations.find((o) => o.id === organizationId)?.role
  return {
    canManage: role === 'OWNER' || role === 'ADMIN',
    roleLoading: isLoading,
    organizationId,
  }
}
