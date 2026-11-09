import { Navigate, useLocation, useParams } from 'react-router-dom'

/**
 * Pages built before the new routes read the project from `?projectId=`.
 * Mirrors the route param into the query until those pages are migrated.
 */
export function ProjectQueryBridge({
  children,
}: {
  children: React.ReactNode
}) {
  const { projectId } = useParams()
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  if (projectId && params.get('projectId') !== projectId) {
    params.set('projectId', projectId)
    return <Navigate to={`${pathname}?${params}`} replace />
  }
  return <>{children}</>
}
