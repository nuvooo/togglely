import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import {
  type BrandColumn,
  type BrandMatrixRow,
  DEFAULT_COLUMN,
} from '@/lib/sdk-tester'
import { cn } from '@/lib/utils'

export interface Matrix {
  columns: BrandColumn[]
  rows: BrandMatrixRow[]
  errors: Record<string, string>
}

interface ResultsMatrixProps {
  matrix: Matrix
  /** Flag + brand shown in the generated code. */
  selected: { flagKey: string | null; brandKey: string | null }
  onSelect: (flagKey: string, brandKey: string | null) => void
}

/** Evaluated flags: one row per flag, one column for the defaults and per brand. */
export function ResultsMatrix({
  matrix,
  selected,
  onSelect,
}: ResultsMatrixProps) {
  const { t } = useTranslation()

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table
        className="w-full border-collapse text-sm"
        aria-label={t('sdk-tester.results.title')}
      >
        <thead>
          <tr className="border-b bg-muted/40">
            <th
              scope="col"
              className="h-9 px-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {t('sdk-tester.results.flag')}
            </th>
            {matrix.columns.map((column) => (
              <th
                key={column.key ?? DEFAULT_COLUMN}
                scope="col"
                className="h-9 px-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {column.key ? column.label : t('sdk-tester.results.default')}
                {column.key && (
                  <span className="block font-mono text-[10px] normal-case">
                    {column.key}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.flagKey} className="border-b last:border-0">
              <th
                scope="row"
                className="px-3 py-2 text-left align-top font-normal"
              >
                <code className="font-mono text-xs font-medium">
                  {row.flagKey}
                </code>
                <span className="block text-[10px] uppercase text-muted-foreground">
                  {row.flagType}
                </span>
              </th>
              {matrix.columns.map((column) => {
                const columnKey = column.key ?? DEFAULT_COLUMN
                const cell = row.cells[columnKey]
                const isSelected =
                  selected.flagKey === row.flagKey &&
                  selected.brandKey === column.key
                return (
                  <td key={columnKey} className="px-1.5 py-1 align-top">
                    {cell ? (
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={t('sdk-tester.results.use-in-code', {
                          flag: row.flagKey,
                          column: column.key
                            ? column.label
                            : t('sdk-tester.results.default'),
                        })}
                        onClick={() => onSelect(row.flagKey, column.key)}
                        className={cn(
                          'flex w-full flex-col items-start gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected && 'bg-accent ring-1 ring-border'
                        )}
                      >
                        <Badge variant={cell.enabled ? 'success' : 'neutral'}>
                          {cell.enabled
                            ? t('sdk-tester.results.enabled')
                            : t('sdk-tester.results.disabled')}
                        </Badge>
                        <code className="max-w-[14rem] truncate font-mono text-xs text-muted-foreground">
                          {JSON.stringify(cell.value)}
                        </code>
                      </button>
                    ) : (
                      <span className="block px-2 py-1 text-xs text-destructive">
                        {matrix.errors[columnKey] ?? '—'}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
