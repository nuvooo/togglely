import { Search, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export interface FilterChip {
  id: string
  label: ReactNode
  count?: number
  active: boolean
}

export interface PageToolbarProps {
  /** Called debounced with the search text; no search field without it. */
  onSearch?: (query: string) => void
  /** Initial search text (e.g. from the URL). */
  defaultSearch?: string
  searchPlaceholder?: string
  /** Accessible name of the search field; defaults to the placeholder. */
  searchLabel?: string
  /** Debounce in ms (default 250). Clearing the field reports immediately. */
  searchDelay?: number
  filters?: FilterChip[]
  onFilterChange?: (id: string) => void
  /** Right-aligned actions (buttons, selects). */
  actions?: ReactNode
  className?: string
}

/** Search field, filter chips and actions above a list. */
export function PageToolbar({
  onSearch,
  defaultSearch = '',
  searchPlaceholder,
  searchLabel,
  searchDelay = 250,
  filters,
  onFilterChange,
  actions,
  className,
}: PageToolbarProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(defaultSearch)
  // Last value handed to onSearch: avoids reporting the initial value or duplicates
  const reported = useRef(defaultSearch)
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  const report = (value: string) => {
    if (value === reported.current) return
    reported.current = value
    onSearchRef.current?.(value)
  }
  const reportRef = useRef(report)
  reportRef.current = report

  useEffect(() => {
    const timer = setTimeout(() => reportRef.current(query), searchDelay)
    return () => clearTimeout(timer)
  }, [query, searchDelay])

  const clear = () => {
    setQuery('')
    report('')
  }

  const placeholder = searchPlaceholder ?? t('table.search')

  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center',
        className
      )}
    >
      {onSearch && (
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault()
                clear()
              }
            }}
            placeholder={placeholder}
            aria-label={searchLabel ?? placeholder}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              aria-label={t('table.clear-search')}
              className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {filters && filters.length > 0 && (
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">{t('table.filters')}</legend>
          {filters.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={chip.active}
              onClick={() => onFilterChange?.(chip.id)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                chip.active
                  ? 'border-foreground/20 bg-accent text-accent-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              {chip.label}
              {chip.count !== undefined && ' '}
              {chip.count !== undefined && (
                <span className="tabular-nums text-muted-foreground">
                  {chip.count}
                </span>
              )}
            </button>
          ))}
        </fieldset>
      )}

      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {actions}
        </div>
      )}
    </div>
  )
}
