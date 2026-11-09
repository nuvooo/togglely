import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/axios'

/** Response of `GET /overview` (only the caller's organizations). */
export interface OverviewData {
  counts: {
    organizations: number
    projects: number
    flags: number
    /** null when no project has a `production` environment. */
    flagsEnabledInProduction: number | null
    runningExperiments: number
  }
  recentFlags: {
    id: string
    projectId: string
    key: string
    name: string
    flagType: string
    updatedAt: string
  }[]
  projects: {
    id: string
    name: string
    key: string
    type: 'SINGLE' | 'MULTI'
    organizationId: string
    organizationName: string
    flagCount: number
    environmentCount: number
    updatedAt: string
  }[]
}

export type OverviewProject = OverviewData['projects'][number]
export type OverviewRecentFlag = OverviewData['recentFlags'][number]

export async function fetchOverview(): Promise<OverviewData> {
  const { data } = await api.get<OverviewData>('/overview')
  return data
}

/** Loads the overview; `reload` retries after an error. */
export function useOverview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const loadId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++loadId.current
    setIsLoading(true)
    setError(false)
    try {
      const loaded = await fetchOverview()
      if (id === loadId.current) setData(loaded)
    } catch {
      if (id === loadId.current) setError(true)
    } finally {
      if (id === loadId.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    return () => {
      // Drop results that arrive after unmount
      loadId.current++
    }
  }, [reload])

  return { data, error, isLoading, reload }
}
