import { Navigate, useLocation } from 'react-router-dom'
import { loginPath } from '@/lib/redirect'
import { useAuthStore } from '@/store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token } = useAuthStore()
  const { pathname, search, hash } = useLocation()

  if (!token) {
    // Deep links survive the login (bare "/" needs no return path)
    const target = pathname + search + hash
    return <Navigate to={target === '/' ? '/login' : loginPath(target)} replace />
  }

  return <>{children}</>
}
