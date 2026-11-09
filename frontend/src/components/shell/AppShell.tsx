import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Menu, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import PendingInvitesBanner from '@/components/PendingInvitesBanner'
import { ThemeToggle } from '@/components/ThemeToggle'
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
import { getArea, ROUTES } from '@/lib/routes'
import { useAuthStore } from '@/store/authStore'
import { CommandPaletteLauncher } from './CommandPaletteLauncher'
import { ContextNav } from './ContextNav'
import { openCommandPalette } from './commandPaletteEvents'
import { shortcutLabel } from './platform'
import { Rail } from './Rail'
import { useLogout } from './useLogout'

/** Application frame: rail, context column, top bar and page outlet. */
export default function AppShell() {
  const { t } = useTranslation()
  const { pathname, hash } = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const handleLogout = useLogout()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const area = getArea(pathname).area
  const hasContext = area !== 'overview' && area !== 'project-picker'

  // Close the mobile drawer on navigation (account sections differ only by hash).
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname and hash are the triggers
  useEffect(() => setDrawerOpen(false), [pathname, hash])

  // The drawer is mobile-only; close it once the viewport reaches the md breakpoint.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setDrawerOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
      {/* biome-ignore lint/a11y/useValidAnchor: skip link keeps a real fragment href; onClick only moves focus without rewriting the router URL hash */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        {t('nav.skip-to-content')}
      </a>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <div className="hidden md:block">
          <Rail />
        </div>
        {hasContext && (
          <div className="hidden md:block">
            <ContextNav />
          </div>
        )}

        <DialogPrimitive.Root open={drawerOpen && hasContext} onOpenChange={setDrawerOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 md:hidden" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 shadow-xl duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left md:hidden"
            >
              <DialogPrimitive.Title className="sr-only">{t('nav.menu')}</DialogPrimitive.Title>
              <ContextNav onNavigate={() => setDrawerOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-5">
            {hasContext && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t('nav.open-menu')}
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <button
              type="button"
              onClick={openCommandPalette}
              // Shrinks first on narrow screens so the controls and the avatar stay visible (390 px)
              data-testid="search-trigger"
              className="ml-auto flex h-8 min-w-0 max-w-64 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t('cmd.search')}…</span>
              <Kbd className="hidden sm:inline-flex">{shortcutLabel('k')}</Kbd>
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
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
                <DropdownMenuItem onClick={() => navigate(ROUTES.account)}>{t('nav.account')}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>{t('nav.logout')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <PendingInvitesBanner />

          <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-8 md:py-6">
              <Outlet />
            </div>
          </main>

          <div className="md:hidden">
            <Rail orientation="bottom" />
          </div>
        </div>
      </div>
      <CommandPaletteLauncher />
    </TooltipProvider>
  )
}
