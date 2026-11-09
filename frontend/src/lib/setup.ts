import { useEffect, useState } from 'react'
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

/**
 * Loads `GET /setup/status` once per page load. A failed request resolves to a
 * fallback and is not cached, so the next caller retries.
 */
export function fetchSetupStatus(): Promise<SetupStatus> {
  if (status) return Promise.resolve(status)
  if (!inflight) {
    const request: Promise<SetupStatus> = api
      .get<SetupStatus>('/setup/status')
      .then(
        (res) => {
          publish(normalize(res.data))
          return status ?? FALLBACK
        },
        () => FALLBACK
      )
      .finally(() => {
        if (inflight === request) inflight = null
      })
    inflight = request
  }
  return inflight
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

/** The instance setup status; `null` while it is loading. */
export function useSetupStatus(): SetupStatus | null {
  const [value, setValue] = useState<SetupStatus | null>(status)

  useEffect(() => {
    let active = true
    listeners.add(setValue)
    fetchSetupStatus().then((next) => {
      if (active) setValue(next)
    })
    return () => {
      active = false
      listeners.delete(setValue)
    }
  }, [])

  return value
}
