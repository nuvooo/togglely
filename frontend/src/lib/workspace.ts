import { useCallback, useEffect, useSyncExternalStore } from 'react'
import api from '@/lib/axios'
import { onSessionExpired } from '@/lib/session'

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
interface WorkspaceSnapshot {
  data: WorkspaceData | null
  error: unknown
}

const EMPTY: WorkspaceSnapshot = { data: null, error: null }

let snapshot: WorkspaceSnapshot = EMPTY
let inflight: Promise<WorkspaceData> | null = null
/** Bumped on reset/refresh; results of older generations are discarded. */
let generation = 0
const listeners = new Set<() => void>()

function setSnapshot(next: WorkspaceSnapshot) {
  snapshot = next
  for (const notify of listeners) notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => snapshot

async function load(): Promise<WorkspaceData> {
  const [projects, orgs] = await Promise.all([api.get('/projects'), api.get('/organizations')])
  return {
    projects: projects.data.projects ?? [],
    organizations: orgs.data.organizations ?? [],
  }
}

/** Starts a load bound to the current generation; stale results never reach the cache. */
function startLoad(): Promise<WorkspaceData> {
  const gen = generation
  const promise: Promise<WorkspaceData> = load()
    .then(
      (data) => {
        if (gen === generation) setSnapshot({ data, error: null })
        return data
      },
      (error: unknown) => {
        if (gen === generation) setSnapshot({ data: snapshot.data, error })
        throw error
      }
    )
    .finally(() => {
      if (inflight === promise) inflight = null
    })
  inflight = promise
  return promise
}

/**
 * Clears the cache; mounted consumers drop their data. For logout, session expiry and tests only —
 * code that creates projects/orgs must call `refreshWorkspace()` instead.
 */
export function resetWorkspaceCache() {
  generation++
  inflight = null
  setSnapshot(EMPTY)
}

onSessionExpired(resetWorkspaceCache)

/** Reloads projects/orgs and notifies all mounted consumers. Rejects if the reload fails. */
export async function refreshWorkspace(): Promise<void> {
  generation++
  await startLoad()
}

/** Projects and organizations of the current user, shared across the shell. */
export function useWorkspace() {
  const { data, error } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (snapshot.data || inflight) return
    if (snapshot.error) setSnapshot(EMPTY)
    // Errors are surfaced through the snapshot.
    startLoad().catch(() => {})
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
