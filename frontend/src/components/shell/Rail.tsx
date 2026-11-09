import { Building2, Flag, LayoutGrid, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getArea, orgPath, projectPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/workspaceStore'

/**
 * Primary navigation. Vertical icon rail on desktop, bottom tab bar on
 * mobile (`orientation="bottom"`).
 */
export function Rail({ orientation = 'side' }: { orientation?: 'side' | 'bottom' }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { lastProjectId, lastOrgId } = useWorkspaceStore()
  const current = getArea(pathname).area

  const items = [
    { area: 'overview', label: t('nav.overview'), icon: LayoutGrid, href: '/overview' },
    {
      area: 'project',
      label: t('nav.project'),
      icon: Flag,
      href: lastProjectId ? projectPath(lastProjectId) : '/overview',
    },
    {
      area: 'org',
      label: t('nav.organization'),
      icon: Building2,
      href: lastOrgId ? orgPath(lastOrgId) : '/orgs',
    },
    { area: 'account', label: t('nav.account'), icon: UserRound, href: '/account' },
  ] as const

  if (orientation === 'bottom') {
    return (
      <nav className="grid grid-cols-4 border-t bg-sidebar" aria-label={t('nav.overview')}>
        {items.map(({ area, label, icon: Icon, href }) => (
          <Link
            key={area}
            to={href}
            aria-label={label}
            aria-current={current === area ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              current === area && 'text-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    )
  }

  return (
    <nav
      className="flex h-full w-14 flex-col items-center gap-1 border-r bg-sidebar py-3"
      aria-label={t('nav.overview')}
    >
      <Link
        to="/overview"
        className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
        aria-label={t('common.app-name')}
      >
        T
      </Link>
      {items.map(({ area, label, icon: Icon, href }) => (
        <Tooltip key={area}>
          <TooltipTrigger asChild>
            <Link
              to={href}
              aria-label={label}
              aria-current={current === area ? 'page' : undefined}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
                current === area && 'bg-sidebar-accent text-foreground',
                area === 'account' && 'mt-auto'
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
}
