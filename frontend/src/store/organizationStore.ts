import { create } from 'zustand'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'

export interface Organization {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
  projects?: Project[]
}

export interface Project {
  id: string
  name: string
  key: string
  organizationId: string
  createdAt: string
  updatedAt: string
  environments?: Environment[]
}

export interface Environment {
  id: string
  name: string
  key: string
  projectId: string
  createdAt: string
}

export interface CreateOrganizationData {
  name: string
  slug?: string
}

export interface CreateProjectData {
  name: string
  key: string
  type?: 'SINGLE' | 'MULTI'
}

interface OrganizationStats {
  totalOrganizations: number
  totalProjects: number
  totalFlags: number
  totalEnabledFlags: number
}

interface OrganizationState {
  organizations: Organization[]
  currentOrganization: Organization | null
  isLoading: boolean
  error: string | null
  stats: OrganizationStats | null

  // Actions
  fetchOrganizations: () => Promise<void>
  fetchOrganizationById: (id: string) => Promise<void>
  createOrganization: (data: CreateOrganizationData) => Promise<Organization>
  updateOrganization: (
    id: string,
    data: Partial<CreateOrganizationData>
  ) => Promise<void>
  deleteOrganization: (id: string) => Promise<void>
  fetchStats: () => Promise<void>

  // Project actions
  fetchProjects: (orgId: string) => Promise<Project[]>
  createProject: (orgId: string, data: CreateProjectData) => Promise<Project>
  updateProject: (
    projectId: string,
    data: Partial<CreateProjectData>
  ) => Promise<void>
  deleteProject: (projectId: string) => Promise<void>

  // Environment actions
  createEnvironment: (
    projectId: string,
    data: { name: string; key: string }
  ) => Promise<Environment>
}

export const useOrganizationStore = create<OrganizationState>((set) => ({
  organizations: [],
  currentOrganization: null,
  isLoading: false,
  error: null,
  stats: null,

  fetchOrganizations: async () => {
    set({ isLoading: true, error: null })
    try {
      const [orgsRes, statsRes] = await Promise.all([
        api.get('/organizations'),
        api.get('/organizations/stats'),
      ])
      set({
        organizations: orgsRes.data.organizations || orgsRes.data,
        stats: statsRes.data,
        isLoading: false,
      })
    } catch (error: unknown) {
      set({
        error: getErrorMessage(error),
        isLoading: false,
      })
    }
  },

  fetchOrganizationById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const [orgResponse, projectsResponse] = await Promise.all([
        api.get(`/organizations/${id}`),
        api.get(`/projects/organization/${id}`),
      ])
      set({
        currentOrganization: {
          ...(orgResponse.data.organization || orgResponse.data),
          projects: projectsResponse.data.projects || projectsResponse.data,
        },
        isLoading: false,
      })
    } catch (error: unknown) {
      set({
        error: getErrorMessage(error),
        isLoading: false,
      })
    }
  },

  createOrganization: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/organizations', data)
      const newOrg = response.data.organization || response.data
      set((state) => ({
        organizations: [...state.organizations, newOrg],
        isLoading: false,
      }))
      return newOrg
    } catch (error: unknown) {
      set({
        error: getErrorMessage(error),
        isLoading: false,
      })
      throw error
    }
  },

  updateOrganization: async (id, data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.patch(`/organizations/${id}`, data)
      set((state) => ({
        organizations: state.organizations.map((org) =>
          org.id === id
            ? { ...org, ...(response.data.organization || response.data) }
            : org
        ),
        currentOrganization:
          state.currentOrganization?.id === id
            ? {
                ...state.currentOrganization,
                ...(response.data.organization || response.data),
              }
            : state.currentOrganization,
        isLoading: false,
      }))
    } catch (error: unknown) {
      set({
        error: getErrorMessage(error),
        isLoading: false,
      })
      throw error
    }
  },

  deleteOrganization: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`/organizations/${id}`)
      set((state) => ({
        organizations: state.organizations.filter((org) => org.id !== id),
        currentOrganization:
          state.currentOrganization?.id === id
            ? null
            : state.currentOrganization,
        isLoading: false,
      }))
    } catch (error: unknown) {
      set({
        error: getErrorMessage(error),
        isLoading: false,
      })
      throw error
    }
  },

  fetchStats: async () => {
    try {
      const response = await api.get('/organizations/stats')
      set({ stats: response.data })
    } catch (error: unknown) {
      console.error('Failed to fetch stats:', error)
    }
  },

  fetchProjects: async (orgId: string) => {
    try {
      const response = await api.get(`/projects/organization/${orgId}`)
      set((state) => ({
        currentOrganization: state.currentOrganization
          ? { ...state.currentOrganization, projects: response.data }
          : null,
      }))
      return response.data
    } catch (error: unknown) {
      console.error('Failed to fetch projects:', error)
      return []
    }
  },

  createProject: async (orgId, data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post(`/projects/organization/${orgId}`, data)
      const newProject = response.data.project || response.data
      set((state) => ({
        currentOrganization: state.currentOrganization
          ? {
              ...state.currentOrganization,
              projects: [
                ...(state.currentOrganization.projects || []),
                newProject,
              ],
            }
          : null,
        isLoading: false,
      }))
      return newProject
    } catch (error: unknown) {
      set({
        error: getErrorMessage(error),
        isLoading: false,
      })
      throw error
    }
  },

  updateProject: async (projectId, data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.patch(`/projects/${projectId}`, data)
      set((state) => ({
        currentOrganization: state.currentOrganization
          ? {
              ...state.currentOrganization,
              projects: state.currentOrganization.projects?.map((p) =>
                p.id === projectId ? { ...p, ...response.data } : p
              ),
            }
          : null,
        isLoading: false,
      }))
    } catch (error: unknown) {
      set({
        error: getErrorMessage(error),
        isLoading: false,
      })
      throw error
    }
  },

  deleteProject: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      await api.delete(`/projects/${projectId}`)
      set((state) => ({
        currentOrganization: state.currentOrganization
          ? {
              ...state.currentOrganization,
              projects: state.currentOrganization.projects?.filter(
                (p) => p.id !== projectId
              ),
            }
          : null,
        isLoading: false,
      }))
    } catch (error: unknown) {
      set({
        error: getErrorMessage(error),
        isLoading: false,
      })
      throw error
    }
  },

  createEnvironment: async (projectId, data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post(
        `/environments/project/${projectId}`,
        data
      )
      const newEnv = response.data
      set((state) => ({
        currentOrganization: state.currentOrganization
          ? {
              ...state.currentOrganization,
              projects: state.currentOrganization.projects?.map((p) =>
                p.id === projectId
                  ? { ...p, environments: [...(p.environments || []), newEnv] }
                  : p
              ),
            }
          : null,
        isLoading: false,
      }))
      return newEnv
    } catch (error: unknown) {
      set({
        error: getErrorMessage(error),
        isLoading: false,
      })
      throw error
    }
  },
}))
