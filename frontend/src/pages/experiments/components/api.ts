import api from '@/lib/axios'

export const EXPERIMENT_STATUSES = ['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number]

export type LifecycleAction = 'start' | 'pause' | 'complete'

export interface ExperimentVariant {
  id: string
  key: string
  name: string
  description?: string | null
  value: string
  weight: number
  isControl: boolean
}

export interface Experiment {
  id: string
  name: string
  key: string
  description: string | null
  hypothesis?: string | null
  status: ExperimentStatus
  trafficPercent: number
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  flag?: { id: string; name: string; key: string; flagType?: string } | null
  environment?: { id: string; name: string; key?: string } | null
  variants: ExperimentVariant[]
  createdBy?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
  _count?: { events: number }
}

/** Shape of GET /experiments/:id/results (see ExperimentResultsService). */
export interface VariantResult {
  key: string
  name: string
  impressions: number
  conversions: number
  /** 0..1 */
  conversionRate: number
  isControl: boolean
}

export interface ExperimentResults {
  variants: VariantResult[]
  totalImpressions: number
  totalConversions: number
  isSignificant: boolean
  /** 0..1, highest confidence of a variant against the control */
  confidence: number
  /** Key of the winning variant, if any */
  winner: string | null
}

export interface ProjectFlag {
  id: string
  name: string
  key: string
  flagType: string
}

export interface ProjectEnvironment {
  id: string
  name: string
  key: string
}

export interface CreateExperimentInput {
  name: string
  key: string
  description?: string
  hypothesis?: string
  flagId: string
  environmentId: string
  trafficPercent: number
  variants: Omit<ExperimentVariant, 'id'>[]
}

/** Server limits (backend/src/modules/experiments/dto/limits.ts). */
export const LIMITS = {
  name: 200,
  key: 100,
  text: 2000,
  variants: 20,
} as const

/** Lifecycle actions the backend allows for a status. */
export function lifecycleActions(status: ExperimentStatus): LifecycleAction[] {
  switch (status) {
    case 'DRAFT':
      return ['start']
    case 'RUNNING':
      return ['pause', 'complete']
    case 'PAUSED':
      return ['start', 'complete']
    default:
      return []
  }
}

/** The backend only deletes drafts. */
export const canDeleteStatus = (status: ExperimentStatus) => status === 'DRAFT'

const listOf = <T>(data: unknown, key: string): T[] => {
  if (Array.isArray(data)) return data as T[]
  const inner = (data as Record<string, unknown> | null)?.[key]
  return Array.isArray(inner) ? (inner as T[]) : []
}

export const experimentsApi = {
  list: (projectId: string) =>
    api.get<Experiment[]>('/experiments', { params: { projectId } }).then((res) => listOf<Experiment>(res.data, 'experiments')),
  get: (id: string) => api.get<Experiment>(`/experiments/${id}`).then((res) => res.data),
  results: (id: string) => api.get<ExperimentResults>(`/experiments/${id}/results`).then((res) => res.data),
  create: (input: CreateExperimentInput) => api.post<Experiment>('/experiments', input).then((res) => res.data),
  remove: (id: string) => api.delete(`/experiments/${id}`).then(() => undefined),
  lifecycle: (id: string, action: LifecycleAction) =>
    api.post<Experiment>(`/experiments/${id}/${action}`).then((res) => res.data),
  flags: (projectId: string) =>
    api.get(`/feature-flags/project/${projectId}`).then((res) => listOf<ProjectFlag>(res.data, 'featureFlags')),
  environments: (projectId: string) =>
    api.get(`/environments/project/${projectId}`).then((res) => listOf<ProjectEnvironment>(res.data, 'environments')),
}
