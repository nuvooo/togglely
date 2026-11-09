import { ChevronRight, Link2Off, Trash2 } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  /** MEMBER+: toggle and edit values (otherwise read only). */
  canEdit: boolean
  /** ADMIN+: delete flags (otherwise the column is hidden). */
  canDelete: boolean
}

const detailId = (flagId: string) => `flag-${flagId}-brands`

/*
 * Every environment cell has the same fixed structure so switches, values
 * and override badges line up across columns and rows:
 *   [switch 2rem] [value slot 5rem] [override slot 2.25rem, MULTI only]
 * Empty slots render a placeholder of the same width.
 */
const VALUE_SLOT = 'w-20 shrink-0'
const OVERRIDE_SLOT = 'w-9 shrink-0'
/** Slots + gaps (0.5rem each) + cell padding (1.5rem). */
const ENV_COLUMN_WIDTH = '9.5rem'
const ENV_COLUMN_WIDTH_MULTI = '12rem'

/** Default value of a non-boolean flag: truncated chip, full value in a tooltip. */
function ValueChip({
  value,
  label,
  readOnlyTitle,
  disabled,
  onClick,
}: {
  value: string
  label: string
  readOnlyTitle?: string
  disabled: boolean
  onClick: () => void
}) {
  const valueId = useId()
  const shown = value === '' ? '""' : value
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Wrapper: a disabled button fires no pointer events for the tooltip. */}
        <span className={cn(VALUE_SLOT, 'flex')}>
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-describedby={valueId}
            className="w-full truncate rounded bg-muted px-1.5 py-0.5 text-left font-mono text-xs text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-muted"
          >
            {shown}
          </button>
          <span id={valueId} className="sr-only">
            {shown}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs break-all font-mono">
        {shown}
        {readOnlyTitle && (
          <span className="mt-1 block font-sans text-muted-foreground">
            {readOnlyTitle}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

/** Number of brands with their own value in an environment (MULTI projects). */
function OverrideBadge({ label, count }: { label: string; count: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            OVERRIDE_SLOT,
            'inline-flex items-center justify-center gap-0.5 rounded border py-0.5 text-xs text-muted-foreground'
          )}
          data-testid="flag-override-badge"
        >
          <Link2Off className="h-3 w-3 shrink-0" aria-hidden />
          <span aria-hidden>{count}</span>
          <span className="sr-only">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

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
  canEdit,
  canDelete,
}: FlagsTableProps) {
  const { t, i18n } = useTranslation()
  const readOnlyTitle = canEdit ? undefined : t('common.read-only')
  const navigate = useNavigate()

  const columns: DataTableColumn<FeatureFlag>[] = [
    {
      key: 'name',
      header: t('flags-page.col-name'),
      className: 'min-w-[12rem] whitespace-nowrap',
      cell: (flag) => {
        const open = expanded.has(flag.id)
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {multi && (
              <button
                type="button"
                onClick={() => onToggleExpanded(flag.id)}
                aria-expanded={open}
                aria-controls={detailId(flag.id)}
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
      width: '6rem',
      cell: (flag) => <Badge variant="neutral">{flag.flagType}</Badge>,
    },
    ...environments.map(
      (column): DataTableColumn<FeatureFlag> => ({
        key: `env-${column.id}`,
        header: (
          <span className="block truncate" title={column.name}>
            {column.name}
          </span>
        ),
        width: multi ? ENV_COLUMN_WIDTH_MULTI : ENV_COLUMN_WIDTH,
        className: cn(
          'whitespace-nowrap',
          multi ? 'max-w-[12rem]' : 'max-w-[9.5rem]'
        ),
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
            <div className="inline-flex items-center gap-2 align-middle">
              <span title={readOnlyTitle} className="inline-flex shrink-0">
                <Switch
                  checked={env.enabled}
                  disabled={
                    !canEdit ||
                    actions.isBusy(defaultRowKey(flag.id, env.environmentId))
                  }
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
              </span>
              {flag.flagType === 'BOOLEAN' ? (
                <span
                  className={VALUE_SLOT}
                  aria-hidden
                  data-testid="flag-value-placeholder"
                />
              ) : (
                <ValueChip
                  value={env.defaultValue}
                  label={t('flags-page.edit-value-label', names)}
                  readOnlyTitle={readOnlyTitle}
                  disabled={!canEdit}
                  onClick={() => onEdit({ flag, env })}
                />
              )}
              {multi &&
                (overrides > 0 ? (
                  <OverrideBadge
                    label={t('flags-page.overrides', { count: overrides })}
                    count={overrides}
                  />
                ) : (
                  <span className={OVERRIDE_SLOT} aria-hidden />
                ))}
            </div>
          )
        },
      })
    ),
    {
      key: 'updated',
      header: t('flags-page.col-updated'),
      hideBelow: 'md',
      width: '7rem',
      align: 'right',
      className: 'whitespace-nowrap text-xs text-muted-foreground',
      cell: (flag) => {
        const date = flag.updatedAt ?? flag.createdAt
        const relative = formatRelative(date, i18n.language)
        if (!date || !relative) return '–'
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
  ]
  if (canDelete) {
    columns.push({
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
    })
  }

  const open = (flag: FeatureFlag) => navigate(flagPath(projectId, flag.id))
  const label = t('flags-page.table-label')

  return (
    <TooltipProvider delayDuration={300}>
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
                  readOnly={!canEdit}
                  {...actions}
                />
              )
            : undefined
        }
        isExpanded={(flag) => expanded.has(flag.id)}
        getExpandedId={(flag) => detailId(flag.id)}
        onRowClick={open}
        // The flag name is a link: rows need no extra tab stop.
        rowFocusable={false}
        loading={loading}
        loadingRows={4}
        empty={empty}
        label={label}
      />
    </TooltipProvider>
  )
}
