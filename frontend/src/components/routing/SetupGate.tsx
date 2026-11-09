import type { ReactNode } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { safeNextPath } from '@/lib/redirect'
import { ROUTES } from '@/lib/routes'
import { useSetupStatus } from '@/lib/setup'
import { useAuthStore } from '@/store/authStore'

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
    </div>
  )
}

/** Sends every visitor to /setup while the instance has no user yet. */
export function RequireSetupDone({ children }: { children: ReactNode }) {
  const status = useSetupStatus()
  if (!status) return <FullPageSpinner />
  if (status.setupRequired) return <Navigate to="/setup" replace />
  return <>{children}</>
}

/** /setup is only reachable on a fresh instance. */
export function SetupRoute({ children }: { children: ReactNode }) {
  const status = useSetupStatus()
  const token = useAuthStore((s) => s.token)
  if (!status) return <FullPageSpinner />
  if (!status.setupRequired) {
    return <Navigate to={token ? ROUTES.projects : '/login'} replace />
  }
  return <>{children}</>
}

/** Pages for logged-out users; logged-in users go to a safe `?next=` or the overview. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const [params] = useSearchParams()
  if (token) {
    return (
      <Navigate to={safeNextPath(params.get('next')) ?? ROUTES.overview} replace />
    )
  }
  return <>{children}</>
}

/** Pages that only make sense when the backend can send emails. */
export function RequireMail({ children }: { children: ReactNode }) {
  const status = useSetupStatus()
  if (!status) return <FullPageSpinner />
  if (!status.mailEnabled) return <Navigate to="/login" replace />
  return <>{children}</>
}
