import { ChevronRight, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { flagPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { BrandMatrix, type BrandMatrixActions } from './BrandMatrix'
import { formatRelative } from './flagsFilter'
import type { EditingValue, FeatureFlag, ProjectEnvironment } from './types'
import { defaultRowKey } from './useProjectFlags'

interface FlagsTableProps {
  projectId: string
  flags: FeatureFlag[]
  /** One switch column each, in this order. */
  environments: ProjectEnvironment[]
  /** MULTI project: switches show the defaults, rows expand to the brand matrix. */
  multi: boolean
  loading?: boolean
  empty?: ReactNode
  actions: BrandMatrixActions
  onEdit: (value: EditingValue) => void
  onDelete: (flag: FeatureFlag) => void
  expanded: ReadonlySet<string>
  onToggleExpanded: (flagId: string) => void
}

const detailId = (flagId: string) => `flag-${flagId}-brands`

/** Flags of a project: name/key, type, a switch per environment, updated, delete. */
export function FlagsTable({
  projectId,
  flags,
  environments,
  multi,
  loading = false,
  empty,
  actions,
  onEdit,
  onDelete,
  expanded,
  onToggleExpanded,
}: FlagsTableProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const columns: DataTableColumn<FeatureFlag>[] = [
    {
      key: 'name',
      header: t('flags-page.col-name'),
      className: 'min-w-[12rem]',
      cell: (flag) => {
        const open = expanded.has(flag.id)
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {multi && (
              <button
                type="button"
                onClick={() => onToggleExpanded(flag.id)}
                aria-expanded={open}
                aria-controls={open ? detailId(flag.id) : undefined}
                aria-label={t('flags-page.brands-toggle', { name: flag.name })}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight
                  className={cn(
                    'h-4 w-4 transition-transform',
                    open && 'rotate-90'
                  )}
                  aria-hidden
                />
              </button>
            )}
            <div className="min-w-0">
              <Link
                to={flagPath(projectId, flag.id)}
                className="block truncate font-medium text-foreground hover:underline"
              >
                {flag.name}
              </Link>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {flag.key}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'type',
      header: t('flags-page.col-type'),
      hideBelow: 'sm',
      cell: (flag) => <Badge variant="neutral">{flag.flagType}</Badge>,
    },
    ...environments.map(
      (column): DataTableColumn<FeatureFlag> => ({
        key: `env-${column.id}`,
        header: column.name,
        align: 'center',
        cell: (flag) => {
          const env = flag.environments?.find(
            (e) => e.environmentId === column.id
          )
          if (!env) {
            return <span className="text-muted-foreground">–</span>
          }
          const names = { flag: flag.name, environment: column.name }
          const overrides = multi
            ? (env.brandValues?.filter((b) => !b.inherited).length ?? 0)
            : 0
          return (
            <div className="inline-flex items-center justify-center gap-2">
              <Switch
                checked={env.enabled}
                disabled={actions.isBusy(
                  defaultRowKey(flag.id, env.environmentId)
                )}
                onCheckedChange={(next) =>
                  actions.toggleDefault(flag, env, next)
                }
                aria-label={t(
                  multi
                    ? 'flags-page.toggle-default-label'
                    : 'flags-page.toggle-label',
                  names
                )}
              />
              {flag.flagType !== 'BOOLEAN' && (
                <button
                  type="button"
                  onClick={() => onEdit({ flag, env })}
                  aria-label={t('flags-page.edit-value-label', names)}
                  title={env.defaultValue}
                  className="max-w-[7rem] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {env.defaultValue === '' ? '""' : env.defaultValue}
                </button>
              )}
              {overrides > 0 && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {t('flags-page.overrides', { count: overrides })}
                </span>
              )}
            </div>
          )
        },
      })
    ),
    {
      key: 'updated',
      header: t('flags-page.col-updated'),
      hideBelow: 'md',
      className: 'whitespace-nowrap text-xs text-muted-foreground',
      cell: (flag) => {
        const date = flag.updatedAt ?? flag.createdAt
        const relative = formatRelative(date, i18n.language)
        if (!relative) return '–'
        return (
          <time
            dateTime={date}
            title={new Date(date).toLocaleString(i18n.language)}
          >
            {relative}
          </time>
        )
      },
    },
    {
      key: 'actions',
      header: t('flags-page.col-actions'),
      srOnlyHeader: true,
      width: '3rem',
      align: 'right',
      className: 'px-2',
      cell: (flag) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(flag)}
          aria-label={t('project-detail.delete-flag.button-label', {
            name: flag.name,
          })}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      ),
    },
  ]

  const open = (flag: FeatureFlag) => navigate(flagPath(projectId, flag.id))
  const label = t('flags-page.table-label')

  return (
    <DataTable
      columns={columns}
      rows={flags}
      getRowId={(flag) => flag.id}
      renderExpanded={
        multi
          ? (flag) => (
              <BrandMatrix
                flag={flag}
                environments={environments}
                onEdit={onEdit}
                {...actions}
              />
            )
          : undefined
      }
      isExpanded={(flag) => expanded.has(flag.id)}
      getExpandedId={(flag) => detailId(flag.id)}
      onRowClick={open}
      loading={loading}
      loadingRows={4}
      empty={empty}
      label={label}
    />
  )
}
