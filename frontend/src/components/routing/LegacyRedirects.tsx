import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import api from '@/lib/axios'
import { projectPath } from '@/lib/routes'

/** Redirects to `to`, replacing `:param` placeholders with current params. */
export function ParamRedirect({ to }: { to: string }) {
  const params = useParams()
  const target = to.replace(
    /:([A-Za-z]+)/g,
    (_, name: string) => params[name] ?? ''
  )
  return <Navigate to={target} replace />
}

/** Old `/feature-flags/:id` links: look up the flag's project first. */
export function LegacyFlagRedirect() {
  const { id } = useParams()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    api
      .get(`/feature-flags/${id}`)
      .then((res) =>
        setTarget(
          `${projectPath(res.data.featureFlag.projectId, 'flags')}/${id}`
        )
      )
      .catch(() => setTarget('/overview'))
  }, [id])

  return target ? <Navigate to={target} replace /> : null
}
