import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/axios'

export interface WorkspaceProject {
  id: string
  name: string
  key: string
  type: 'SINGLE' | 'MULTI'
  organizationId: string
}
export interface WorkspaceOrganization {
  id: string
  name: string
  role?: string
}
interface WorkspaceData {
  projects: WorkspaceProject[]
  organizations: WorkspaceOrganization[]
}

let cache: WorkspaceData | null = null
let inflight: Promise<WorkspaceData> | null = null
const listeners = new Set<() => void>()

async function load(): Promise<WorkspaceData> {
  const [projects, orgs] = await Promise.all([api.get('/projects'), api.get('/organizations')])
  return {
    projects: projects.data.projects ?? [],
    organizations: orgs.data.organizations ?? [],
  }
}

/** Clears the cache (tests, logout, after creating projects/orgs). */
export function resetWorkspaceCache() {
  cache = null
  inflight = null
}

/** Reloads projects/orgs and notifies all mounted consumers. */
export async function refreshWorkspace() {
  inflight = load()
  cache = await inflight
  inflight = null
  for (const notify of listeners) notify()
}

/** Projects and organizations of the current user, shared across the shell. */
export function useWorkspace() {
  const [data, setData] = useState<WorkspaceData | null>(cache)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    const notify = () => setData(cache)
    listeners.add(notify)
    if (!cache) {
      inflight ??= load()
      inflight
        .then((result) => {
          cache = result
          inflight = null
          setData(result)
        })
        .catch((err) => {
          inflight = null
          setError(err)
        })
    }
    return () => {
      listeners.delete(notify)
    }
  }, [])

  const projectsByOrg = useCallback(
    (orgId: string) => (data?.projects ?? []).filter((p) => p.organizationId === orgId),
    [data]
  )

  return {
    projects: data?.projects ?? [],
    organizations: data?.organizations ?? [],
    isLoading: !data && !error,
    error,
    projectsByOrg,
  }
}
