import { create } from 'zustand';
import api from '@/lib/axios';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  projects?: Project[];
}

export interface Project {
  id: string;
  name: string;
  key: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  environments?: Environment[];
}

export interface Environment {
  id: string;
  name: string;
  key: string;
  projectId: string;
  createdAt: string;
}

export interface CreateOrganizationData {
  name: string;
  slug: string;
}

export interface CreateProjectData {
  name: string;
  key: string;
}

interface OrganizationStats {
  totalOrganizations: number;
  totalProjects: number;
  totalFlags: number;
  totalEnabledFlags: number;
}

interface OrganizationState {
  organizations: Organization[];
  currentOrganization: Organization | null;
  isLoading: boolean;
  error: string | null;
  stats: OrganizationStats | null;
  
  // Actions
  fetchOrganizations: () => Promise<void>;
  fetchOrganizationById: (id: string) => Promise<void>;
  createOrganization: (data: CreateOrganizationData) => Promise<Organization>;
  updateOrganization: (id: string, data: Partial<CreateOrganizationData>) => Promise<void>;
  deleteOrganization: (id: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  
  // Project actions
  fetchProjects: (orgId: string) => Promise<Project[]>;
  createProject: (orgId: string, data: CreateProjectData) => Promise<Project>;
  updateProject: (projectId: string, data: Partial<CreateProjectData>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  
  // Environment actions
  createEnvironment: (projectId: string, data: { name: string; key: string }) => Promise<Environment>;
}

export const useOrganizationStore = create<OrganizationState>((set) => ({
  organizations: [],
  currentOrganization: null,
  isLoading: false,
  error: null,
  stats: null,

  fetchOrganizations: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/organizations');
      set({ organizations: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to fetch organizations', isLoading: false });
    }
  },

  fetchOrganizationById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const [orgResponse, projectsResponse] = await Promise.all([
        api.get(`/organizations/${id}`),
        api.get(`/projects/organization/${id}`),
      ]);
      set({ 
        currentOrganization: {
          ...orgResponse.data,
          projects: projectsResponse.data,
        }, 
        isLoading: false 
      });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to fetch organization', isLoading: false });
    }
  },

  createOrganization: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/organizations', data);
      const newOrg = response.data;
      set((state) => ({
        organizations: [...state.organizations, newOrg],
        isLoading: false,
      }));
      return newOrg;
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to create organization', isLoading: false });
      throw error;
    }
  },

  updateOrganization: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch(`/organizations/${id}`, data);
      set((state) => ({
        organizations: state.organizations.map((org) =>
          org.id === id ? { ...org, ...response.data } : org
        ),
        currentOrganization: state.currentOrganization?.id === id 
          ? { ...state.currentOrganization, ...response.data }
          : state.currentOrganization,
        isLoading: false,
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to update organization', isLoading: false });
      throw error;
    }
  },

  deleteOrganization: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/organizations/${id}`);
      set((state) => ({
        organizations: state.organizations.filter((org) => org.id !== id),
        currentOrganization: state.currentOrganization?.id === id ? null : state.currentOrganization,
        isLoading: false,
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to delete organization', isLoading: false });
      throw error;
    }
  },

  fetchStats: async () => {
    try {
      const response = await api.get('/organizations/stats');
      set({ stats: response.data });
    } catch (error: any) {
      console.error('Failed to fetch stats:', error);
    }
  },

  fetchProjects: async (orgId: string) => {
    try {
      const response = await api.get(`/projects/organization/${orgId}`);
      set((state) => ({
        currentOrganization: state.currentOrganization
          ? { ...state.currentOrganization, projects: response.data }
          : null,
      }));
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch projects:', error);
      return [];
    }
  },

  createProject: async (orgId, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post(`/projects/organization/${orgId}`, data);
      const newProject = response.data;
      set((state) => ({
        currentOrganization: state.currentOrganization
          ? {
              ...state.currentOrganization,
              projects: [...(state.currentOrganization.projects || []), newProject],
            }
          : null,
        isLoading: false,
      }));
      return newProject;
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to create project', isLoading: false });
      throw error;
    }
  },

  updateProject: async (projectId, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch(`/projects/${projectId}`, data);
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
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to update project', isLoading: false });
      throw error;
    }
  },

  deleteProject: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/projects/${projectId}`);
      set((state) => ({
        currentOrganization: state.currentOrganization
          ? {
              ...state.currentOrganization,
              projects: state.currentOrganization.projects?.filter((p) => p.id !== projectId),
            }
          : null,
        isLoading: false,
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to delete project', isLoading: false });
      throw error;
    }
  },

  createEnvironment: async (projectId, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post(`/environments/project/${projectId}`, data);
      const newEnv = response.data;
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
      }));
      return newEnv;
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to create environment', isLoading: false });
      throw error;
    }
  },
}));
