import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { resetWorkspaceCache } from '@/lib/workspace'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'

/** Logs out and clears all workspace state (cache and remembered context). */
export function useLogout() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  return useCallback(() => {
    resetWorkspaceCache()
    useWorkspaceStore.getState().reset()
    logout()
    navigate('/login')
  }, [logout, navigate])
}
