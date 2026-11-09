import { useEffect, useState } from 'react'
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import api from '@/lib/axios'
import { experimentPath, flagPath, projectPath, ROUTES } from '@/lib/routes'

/**
 * Redirects to `to`, replacing `:param` placeholders with current params.
 * Query string and hash of the old URL are kept.
 */
export function ParamRedirect({ to }: { to: string }) {
  const params = useParams()
  const { search, hash } = useLocation()
  const pathname = to.replace(/:([A-Za-z]+)/g, (_, name: string) => params[name] ?? '')
  return <Navigate to={{ pathname, search, hash }} replace />
}

/** Old `/feature-flags/:id` links: look up the flag's project first. */
export function LegacyFlagRedirect() {
  const { id = '' } = useParams()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    api
      .get(`/feature-flags/${id}`)
      .then((res) => setTarget(flagPath(res.data.featureFlag.projectId, id)))
      .catch(() => setTarget(ROUTES.overview))
  }, [id])

  return target ? <Navigate to={target} replace /> : null
}

/**
 * Old `/experiments` and `/experiments/new` links carried the project as `?projectId=`.
 * Without it there is no project context, so fall back to the overview.
 */
export function LegacyExperimentsRedirect({ create = false }: { create?: boolean }) {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')
  if (!projectId) return <Navigate to={ROUTES.overview} replace />
  const base = projectPath(projectId, 'experiments')
  return <Navigate to={create ? `${base}/new` : base} replace />
}

/** Old `/experiments/:id` links: look up the experiment's project first. */
export function LegacyExperimentRedirect() {
  const { id = '' } = useParams()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    api
      .get(`/experiments/${id}`)
      .then((res) => {
        const projectId: string | undefined = res.data?.projectId
        setTarget(projectId ? experimentPath(projectId, id) : ROUTES.overview)
      })
      .catch(() => setTarget(ROUTES.overview))
  }, [id])

  return target ? <Navigate to={target} replace /> : null
}
