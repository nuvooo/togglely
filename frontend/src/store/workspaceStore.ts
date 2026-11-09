import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WorkspaceState {
  lastProjectId: string | null
  lastOrgId: string | null
  rememberProject: (projectId: string, orgId: string) => void
  rememberOrg: (orgId: string) => void
  reset: () => void
}

/** Remembers the last used project/organization for the navigation rail. */
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      lastProjectId: null,
      lastOrgId: null,
      rememberProject: (lastProjectId, lastOrgId) => set({ lastProjectId, lastOrgId }),
      rememberOrg: (lastOrgId) => set({ lastOrgId }),
      reset: () => set({ lastProjectId: null, lastOrgId: null }),
    }),
    { name: 'togglely-workspace' }
  )
)
