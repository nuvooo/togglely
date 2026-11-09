import { Command } from 'cmdk'
import { Building2, Flag, FolderKanban, Moon, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import api from '@/lib/axios'
import { getArea, orgPath, projectPath } from '@/lib/routes'
import { useWorkspace } from '@/lib/workspace'
import { useThemeStore } from '@/store/themeStore'

interface FlagHit {
  id: string
  name: string
  key: string
}

const itemClass =
  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground'
const groupClass =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground'

/** Global Ctrl/Cmd+K palette: navigation, projects, flags, actions. */
export function CommandPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { projects, organizations } = useWorkspace()
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const [open, setOpen] = useState(false)
  const [flags, setFlags] = useState<FlagHit[]>([])
  const area = getArea(pathname)
  const projectId = area.area === 'project' ? area.id : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{t('cmd.search')}</DialogTitle>
        <Command label={t('cmd.search')} className="flex flex-col">
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
                    value={`flag ${f.name} ${f.key}`}
                    onSelect={() => run(() => navigate(`${projectPath(projectId, 'flags')}/${f.id}`))}
                    className={itemClass}
                  >
                    <Flag className="h-4 w-4 text-muted-foreground" />
                    {f.name}
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{f.key}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading={t('cmd.projects')} className={groupClass}>
              {projects.map((p) => (
                <Command.Item
                  key={p.id}
                  value={`project ${p.name} ${p.key}`}
                  onSelect={() => run(() => navigate(projectPath(p.id)))}
                  className={itemClass}
                >
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  {p.name}
                </Command.Item>
              ))}
              {organizations.map((o) => (
                <Command.Item
                  key={o.id}
                  value={`org ${o.name}`}
                  onSelect={() => run(() => navigate(orgPath(o.id)))}
                  className={itemClass}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {o.name}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading={t('cmd.actions')} className={groupClass}>
              {projectId && (
                <Command.Item
                  value="new flag"
                  onSelect={() => run(() => navigate(`${projectPath(projectId, 'flags')}?new=1`))}
                  className={itemClass}
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  {t('cmd.new-flag')}
                </Command.Item>
              )}
              <Command.Item value="theme dark light" onSelect={() => run(toggleTheme)} className={itemClass}>
                <Moon className="h-4 w-4 text-muted-foreground" />
                {t('cmd.toggle-theme')}
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
