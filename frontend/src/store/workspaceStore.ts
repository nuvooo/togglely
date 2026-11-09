import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { onSessionExpired } from '@/lib/session'

interface WorkspaceState {
  lastProjectId: string | null
  lastOrgId: string | null
  rememberProject: (projectId: string, orgId: string) => void
  rememberOrg: (orgId: string) => void
  /** Drops the remembered project if it is the given (deleted) one. */
  forgetProject: (projectId: string) => void
  /**
   * Drops the remembered org if it is the given (deleted) one. `projectIds` are the
   * org's projects, which are deleted with it; the remembered project is dropped if among them.
   */
  forgetOrg: (orgId: string, projectIds?: string[]) => void
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
      forgetProject: (projectId) =>
        set((s) => (s.lastProjectId === projectId ? { lastProjectId: null } : s)),
      forgetOrg: (orgId, projectIds = []) =>
        set((s) => ({
          lastOrgId: s.lastOrgId === orgId ? null : s.lastOrgId,
          lastProjectId:
            s.lastProjectId && projectIds.includes(s.lastProjectId) ? null : s.lastProjectId,
        })),
      reset: () => set({ lastProjectId: null, lastOrgId: null }),
    }),
    { name: 'togglely-workspace' }
  )
)

onSessionExpired(() => useWorkspaceStore.getState().reset())

