import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** CSS width of the column, e.g. `'12rem'`, `'40%'`, `'3rem'`. */
  width?: string
  align?: 'left' | 'center' | 'right'
  /** Applied to the header and every cell of the column. */
  className?: string
  /** Hide the column on small screens (below the breakpoint). */
  hideBelow?: 'sm' | 'md' | 'lg'
  /** Visually hidden header (e.g. an actions column); still read by screen readers. */
  srOnlyHeader?: boolean
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  /**
   * Makes rows clickable: the row becomes focusable and Enter activates it.
   * Clicks on links, buttons, inputs etc. inside the row do not trigger it.
   */
  onRowClick?: (row: T) => void
  rowClassName?: string | ((row: T) => string | undefined)
  /** Shows skeleton rows instead of `rows`. */
  loading?: boolean
  /** Number of skeleton rows (default 5). */
  loadingRows?: number
  /** Shown in a full-width row when there are no rows (and not loading). */
  empty?: ReactNode
  /** Header sticks to the top of the table container; give it a max height via `className`. */
  stickyHeader?: boolean
  /** Accessible name of the table. */
  label?: string
  className?: string
  /**
   * Content of a full-width row rendered below the row (e.g. details).
   * Returning `null` renders no extra row.
   */
  renderExpanded?: (row: T) => ReactNode | null
  /** Whether the expanded row is shown (default: always, when `renderExpanded` is set). */
  isExpanded?: (row: T) => boolean
  /**
   * DOM id of the expanded row's cell, for `aria-controls` on a toggle button.
   * Default: `${getRowId(row)}-expanded`.
   */
  getExpandedId?: (row: T) => string
}

const HIDE_BELOW: Record<
  NonNullable<DataTableColumn<unknown>['hideBelow']>,
  string
> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

const ALIGN = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

// Inner elements that handle clicks themselves
const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="button"], [role="menuitem"], [role="switch"], [role="checkbox"], [data-row-click-ignore]'

function columnClass<T>(column: DataTableColumn<T>) {
  return cn(
    ALIGN[column.align ?? 'left'],
    column.hideBelow && HIDE_BELOW[column.hideBelow],
    column.className
  )
}

/**
 * Dense app table: small uppercase header, 44 px rows, row hover, optional row click
 * and optional expandable rows (`renderExpanded` / `isExpanded`).
 * Scrolls horizontally on narrow screens; use `hideBelow` for secondary columns.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  rowClassName,
  loading = false,
  loadingRows = 5,
  empty,
  stickyHeader = false,
  label,
  className,
  renderExpanded,
  isExpanded,
  getExpandedId,
}: DataTableProps<T>) {
  const { t } = useTranslation()

  const handleClick = (row: T) => (event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as Element
    // Ignore clicks from portals (menus, dialogs) and from interactive children
    if (!event.currentTarget.contains(target)) return
    const interactive = target.closest(INTERACTIVE)
    if (interactive && event.currentTarget.contains(interactive)) return
    onRowClick?.(row)
  }

  const handleKeyDown =
    (row: T) => (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onRowClick?.(row)
      }
    }

  let body: ReactNode
  if (loading) {
    body = Array.from({ length: loadingRows }, (_, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
      <tr key={index} className="h-11 border-b last:border-0">
        {columns.map((column) => (
          <td key={column.key} className={cn('px-3 py-2', columnClass(column))}>
            <Skeleton className="h-4 w-full max-w-[12rem]" />
          </td>
        ))}
      </tr>
    ))
  } else if (rows.length === 0) {
    body = empty ? (
      <tr>
        <td colSpan={columns.length} className="p-0">
          {empty}
        </td>
      </tr>
    ) : null
  } else {
    body = rows.map((row) => {
      const id = getRowId(row)
      const expanded =
        renderExpanded && (isExpanded?.(row) ?? true)
          ? renderExpanded(row)
          : null
      const open = expanded !== null && expanded !== undefined
      return (
        <Fragment key={id}>
          <tr
            tabIndex={onRowClick ? 0 : undefined}
            onClick={onRowClick ? handleClick(row) : undefined}
            onKeyDown={onRowClick ? handleKeyDown(row) : undefined}
            data-clickable={onRowClick ? '' : undefined}
            className={cn(
              'h-11 border-b transition-colors hover:bg-accent/50',
              open ? 'bg-accent/30' : 'last:border-0',
              onRowClick &&
                'cursor-pointer focus-visible:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              typeof rowClassName === 'function'
                ? rowClassName(row)
                : rowClassName
            )}
          >
            {columns.map((column) => (
              <td
                key={column.key}
                className={cn('px-3 py-2 align-middle', columnClass(column))}
              >
                {column.cell(row)}
              </td>
            ))}
          </tr>
          {open && (
            <tr className="border-b last:border-0">
              <td
                id={getExpandedId ? getExpandedId(row) : `${id}-expanded`}
                colSpan={columns.length}
                className="bg-muted/20 px-3 py-3"
              >
                {expanded}
              </td>
            </tr>
          )}
        </Fragment>
      )
    })
  }

  return (
    <div
      className={cn(
        'relative w-full rounded-lg border bg-card',
        stickyHeader ? 'overflow-auto' : 'overflow-x-auto',
        className
      )}
      aria-busy={loading || undefined}
    >
      {loading && (
        <span role="status" className="sr-only">
          {t('common.loading')}
        </span>
      )}
      <table className="w-full border-collapse text-sm" aria-label={label}>
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.key}
              style={column.width ? { width: column.width } : undefined}
            />
          ))}
        </colgroup>
        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="border-b bg-muted/40">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'h-9 whitespace-nowrap px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground',
                  stickyHeader && 'bg-muted',
                  columnClass(column)
                )}
              >
                {column.srOnlyHeader ? (
                  <span className="sr-only">{column.header}</span>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  )
}
