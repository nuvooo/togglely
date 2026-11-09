import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/axios'

export interface SetupStatus {
  /** No user exists yet: the instance must be set up via /setup. */
  setupRequired: boolean
  /** SMTP is configured, so the backend actually sends emails. */
  mailEnabled: boolean
  /** The instance sets SETUP_TOKEN; /setup must send it along. */
  setupTokenRequired: boolean
}

/** Used while the status cannot be loaded: behave like a set-up instance without mail. */
const FALLBACK: SetupStatus = {
  setupRequired: false,
  mailEnabled: false,
  setupTokenRequired: false,
}

let status: SetupStatus | null = null
let inflight: Promise<SetupStatus> | null = null
const listeners = new Set<(next: SetupStatus) => void>()

function publish(next: SetupStatus) {
  status = next
  for (const notify of listeners) notify(next)
}

const normalize = (data: Partial<SetupStatus> | undefined): SetupStatus => ({
  setupRequired: data?.setupRequired === true,
  mailEnabled: data?.mailEnabled === true,
  setupTokenRequired: data?.setupTokenRequired === true,
})

/** Loads the status once; rejects (uncached) when the request fails. */
function loadSetupStatus(): Promise<SetupStatus> {
  if (status) return Promise.resolve(status)
  if (!inflight) {
    const request: Promise<SetupStatus> = api
      .get<SetupStatus>('/setup/status')
      .then((res) => {
        publish(normalize(res.data))
        return status ?? FALLBACK
      })
      .finally(() => {
        if (inflight === request) inflight = null
      })
    inflight = request
  }
  return inflight
}

/**
 * Loads `GET /setup/status` once per page load. A failed request resolves to a
 * fallback and is not cached, so the next caller retries.
 */
export function fetchSetupStatus(): Promise<SetupStatus> {
  return loadSetupStatus().catch(() => FALLBACK)
}

/** Called after a successful (or already completed) setup so /setup stops being offered. */
export function markSetupComplete() {
  publish({ ...(status ?? FALLBACK), setupRequired: false })
}

/** Tests only: forgets the cached status. */
export function resetSetupStatus() {
  status = null
  inflight = null
}

export interface SetupStatusResult {
  /** `null` while loading or after a failed request. */
  status: SetupStatus | null
  /** The last request failed; `retry` loads again. */
  error: boolean
  retry: () => void
}

/** The instance setup status including the failure state, for pages that must not guess. */
export function useSetupStatusResult(): SetupStatusResult {
  const [value, setValue] = useState<SetupStatus | null>(status)
  const [error, setError] = useState(false)
  const active = useRef(true)

  const load = useCallback(() => {
    setError(false)
    loadSetupStatus().then(
      (next) => {
        if (active.current) setValue(next)
      },
      () => {
        if (active.current) setError(true)
      }
    )
  }, [])

  useEffect(() => {
    active.current = true
    listeners.add(setValue)
    load()
    return () => {
      active.current = false
      listeners.delete(setValue)
    }
  }, [load])

  return { status: value, error, retry: load }
}

/** The instance setup status; `null` while it is loading. Falls back to a set-up instance without mail on errors. */
export function useSetupStatus(): SetupStatus | null {
  const { status: value, error } = useSetupStatusResult()
  return value ?? (error ? FALLBACK : null)
}
