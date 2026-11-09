import { Menu, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import PendingInvitesBanner from '@/components/PendingInvitesBanner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getArea } from '@/lib/routes'
import { resetWorkspaceCache } from '@/lib/workspace'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { CommandPalette } from './CommandPalette'
import { ContextNav } from './ContextNav'
import { Rail } from './Rail'

const openPalette = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))

/** Application frame: rail, context column, top bar and page outlet. */
export default function AppShell() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const hasContext = getArea(pathname).area !== 'overview'

  // Close the mobile drawer on navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
  useEffect(() => setDrawerOpen(false), [pathname])

  const handleLogout = () => {
    resetWorkspaceCache()
    useWorkspaceStore.getState().reset()
    logout()
    navigate('/login')
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <div className="hidden md:block">
          <Rail />
        </div>
        {hasContext && (
          <div className="hidden md:block">
            <ContextNav />
          </div>
        )}

        {drawerOpen && hasContext && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label={t('common.close')}
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 shadow-xl">
              <ContextNav />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-5">
            {hasContext && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t('nav.open-menu')}
                onClick={() => setDrawerOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <button
              type="button"
              onClick={openPalette}
              className="ml-auto flex h-8 w-full max-w-64 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">{t('cmd.search')}…</span>
              <Kbd>Ctrl K</Kbd>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                  aria-label={t('nav.account')}
                >
                  {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{user?.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/account')}>{t('nav.account')}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>{t('nav.logout')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <PendingInvitesBanner />

          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>

          <div className="md:hidden">
            <Rail orientation="bottom" />
          </div>
        </div>
      </div>
      <CommandPalette />
    </TooltipProvider>
  )
}
