import { Fragment, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { DataTableColumn } from '@/components/data/DataTable'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/*
 * DataTable has no expandable rows yet. This table renders the same columns
 * with the same look plus a full-width detail row below expanded rows.
 * TODO(integration): fold `renderExpanded` into DataTable and drop this file.
 */

const HIDE_BELOW = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
} as const

const ALIGN = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="button"], [role="menuitem"], [role="switch"], [role="checkbox"], [data-row-click-ignore]'

function columnClass<T>(column: DataTableColumn<T>) {
  return cn(
    ALIGN[column.align ?? 'left'],
    column.hideBelow && HIDE_BELOW[column.hideBelow],
    column.className
  )
}

interface ExpandableTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  /** Ids of expanded rows. */
  expanded: ReadonlySet<string>
  /** Content of the detail row; gets the id `detailId(rowId)`. */
  renderExpanded: (row: T) => ReactNode
  detailId: (rowId: string) => string
  onRowClick?: (row: T) => void
  loading?: boolean
  loadingRows?: number
  empty?: ReactNode
  label?: string
}

export function ExpandableTable<T>({
  columns,
  rows,
  getRowId,
  expanded,
  renderExpanded,
  detailId,
  onRowClick,
  loading = false,
  loadingRows = 5,
  empty,
  label,
}: ExpandableTableProps<T>) {
  const { t } = useTranslation()

  const handleClick = (row: T) => (event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as Element
    if (!event.currentTarget.contains(target)) return
    const interactive = target.closest(INTERACTIVE)
    if (interactive && event.currentTarget.contains(interactive)) return
    onRowClick?.(row)
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
      const open = expanded.has(id)
      return (
        <Fragment key={id}>
          <tr
            tabIndex={onRowClick ? 0 : undefined}
            onClick={onRowClick ? handleClick(row) : undefined}
            onKeyDown={
              onRowClick
                ? (event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onRowClick(row)
                    }
                  }
                : undefined
            }
            data-clickable={onRowClick ? '' : undefined}
            className={cn(
              'h-11 border-b transition-colors hover:bg-accent/50',
              !open && 'last:border-0',
              open && 'bg-accent/30',
              onRowClick &&
                'cursor-pointer focus-visible:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
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
                id={detailId(id)}
                colSpan={columns.length}
                className="bg-muted/20 px-3 py-3"
              >
                {renderExpanded(row)}
              </td>
            </tr>
          )}
        </Fragment>
      )
    })
  }

  return (
    <div
      className="relative w-full overflow-x-auto rounded-lg border bg-card"
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
        <thead>
          <tr className="border-b bg-muted/40">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'h-9 whitespace-nowrap px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground',
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
