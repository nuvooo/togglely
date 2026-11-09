import { Command, defaultFilter } from 'cmdk'
import {
  ArrowRight,
  Building2,
  Flag,
  FolderKanban,
  LogOut,
  Moon,
  Plus,
  Search,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import api from '@/lib/axios'
import { flagPath, getArea, orgPath, projectPath, ROUTES } from '@/lib/routes'
import { useWorkspace } from '@/lib/workspace'
import { useThemeStore } from '@/store/themeStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { isPaletteShortcut, OPEN_COMMAND_PALETTE_EVENT } from './commandPaletteEvents'
import { useLogout } from './useLogout'

interface FlagHit {
  id: string
  name: string
  key: string
}

interface NavEntry {
  id: string
  label: string
  href: string
}

/**
 * Item values carry ids so they stay unique; matching uses the human-readable
 * keywords only, so typing never matches against ids.
 */
const filter = (value: string, search: string, keywords?: string[]) =>
  defaultFilter(keywords?.length ? keywords.join(' ') : value, search)

const itemClass =
  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground'
const groupClass =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground'

/**
 * Global Ctrl/Cmd+K palette: navigation, projects, flags, actions.
 * Loaded lazily by `CommandPaletteLauncher`; `initialOpen` opens it on first load.
 */
export function CommandPalette({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { projects, organizations } = useWorkspace()
  const lastOrgId = useWorkspaceStore((s) => s.lastOrgId)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const logout = useLogout()
  const [open, setOpen] = useState(initialOpen)
  const [flags, setFlags] = useState<FlagHit[]>([])
  const area = getArea(pathname)
  const projectId = area.area === 'project' ? area.id : undefined
  const orgId = (area.area === 'org' ? area.id : undefined) ?? lastOrgId ?? undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return
      e.preventDefault()
      setOpen((o) => !o)
    }
    const onOpen = () => setOpen(true)
    document.addEventListener('keydown', onKey)
    document.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (!open || !projectId) return
    let cancelled = false
    setFlags([])
    api
      .get(`/feature-flags/project/${projectId}`)
      .then((res) => {
        if (!cancelled) setFlags(res.data.featureFlags ?? [])
      })
      .catch(() => {
        if (!cancelled) setFlags([])
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  const nav: NavEntry[] = [{ id: 'overview', label: t('nav.overview'), href: ROUTES.overview }]
  if (projectId) {
    const project = projects.find((p) => p.id === projectId)
    const prefix = project ? `${project.name} · ` : ''
    nav.push(
      { id: 'p-flags', label: prefix + t('nav.feature-flags'), href: projectPath(projectId, 'flags') },
      { id: 'p-experiments', label: prefix + t('nav.experiments'), href: projectPath(projectId, 'experiments') },
      { id: 'p-environments', label: prefix + t('nav.environments'), href: projectPath(projectId, 'environments') }
    )
    if (project?.type === 'MULTI') {
      nav.push({ id: 'p-brands', label: prefix + t('nav.brands'), href: projectPath(projectId, 'brands') })
    }
    nav.push(
      { id: 'p-sdk', label: prefix + t('nav.sdk'), href: projectPath(projectId, 'sdk') },
      { id: 'p-webhooks', label: prefix + t('nav.webhooks'), href: projectPath(projectId, 'webhooks') },
      { id: 'p-settings', label: prefix + t('nav.settings'), href: projectPath(projectId, 'settings') }
    )
  }
  if (orgId) {
    const org = organizations.find((o) => o.id === orgId)
    const prefix = org ? `${org.name} · ` : ''
    nav.push(
      { id: 'o-projects', label: prefix + t('nav.projects'), href: orgPath(orgId, 'projects') },
      { id: 'o-members', label: prefix + t('nav.members'), href: orgPath(orgId, 'members') },
      { id: 'o-api-keys', label: prefix + t('nav.api-keys'), href: orgPath(orgId, 'api-keys') },
      { id: 'o-audit-log', label: prefix + t('nav.audit-log'), href: orgPath(orgId, 'audit-log') },
      { id: 'o-settings', label: prefix + t('nav.settings'), href: orgPath(orgId, 'settings') }
    )
  }
  nav.push({ id: 'account', label: t('nav.account'), href: ROUTES.account })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{t('cmd.search')}</DialogTitle>
        <Command label={t('cmd.search')} filter={filter} className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder={t('cmd.placeholder')}
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              {t('cmd.empty')}
            </Command.Empty>
            {flags.length > 0 && projectId && (
              <Command.Group heading={t('cmd.flags')} className={groupClass}>
                {flags.map((f) => (
                  <Command.Item
                    key={f.id}
                    value={`flag:${f.id}`}
                    keywords={[f.name, f.key]}
                    onSelect={() => run(() => navigate(flagPath(projectId, f.id)))}
                    className={itemClass}
                  >
                    <Flag className="h-4 w-4 text-muted-foreground" />
                    {f.name}
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{f.key}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading={t('cmd.navigation')} className={groupClass}>
              {nav.map((n) => (
                <Command.Item
                  key={n.id}
                  value={`nav:${n.id}`}
                  keywords={[n.label]}
                  onSelect={() => run(() => navigate(n.href))}
                  className={itemClass}
                >
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  {n.label}
                </Command.Item>
              ))}
            </Command.Group>
            {projects.length > 0 && (
              <Command.Group heading={t('cmd.projects')} className={groupClass}>
                {projects.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`project:${p.id}`}
                    keywords={[p.name, p.key]}
                    onSelect={() => run(() => navigate(projectPath(p.id)))}
                    className={itemClass}
                  >
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    {p.name}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {organizations.length > 0 && (
              <Command.Group heading={t('nav.organizations')} className={groupClass}>
                {organizations.map((o) => (
                  <Command.Item
                    key={o.id}
                    value={`org:${o.id}`}
                    keywords={[o.name]}
                    onSelect={() => run(() => navigate(orgPath(o.id)))}
                    className={itemClass}
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {o.name}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading={t('cmd.actions')} className={groupClass}>
              {projectId && (
                <Command.Item
                  value="action:new-flag"
                  keywords={[t('cmd.new-flag')]}
                  onSelect={() => run(() => navigate(`${projectPath(projectId, 'flags')}?new=1`))}
                  className={itemClass}
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  {t('cmd.new-flag')}
                </Command.Item>
              )}
              <Command.Item
                value="action:toggle-theme"
                keywords={[t('cmd.toggle-theme'), 'theme dark light']}
                onSelect={() => run(toggleTheme)}
                className={itemClass}
              >
                <Moon className="h-4 w-4 text-muted-foreground" />
                {t('cmd.toggle-theme')}
              </Command.Item>
              <Command.Item
                value="action:logout"
                keywords={[t('nav.logout'), 'logout sign out']}
                onSelect={() => run(logout)}
                className={itemClass}
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
                {t('nav.logout')}
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export default CommandPalette
