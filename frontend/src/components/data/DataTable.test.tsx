import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { DataTable, type DataTableColumn } from './DataTable'

interface Item {
  id: string
  name: string
  type: string
}

const ITEMS: Item[] = [
  { id: 'a', name: 'Dark mode', type: 'BOOLEAN' },
  { id: 'b', name: 'Banner text', type: 'STRING' },
]

const columns: DataTableColumn<Item>[] = [
  { key: 'name', header: 'Name', cell: (row) => row.name },
  { key: 'type', header: 'Typ', cell: (row) => row.type, hideBelow: 'md' },
  {
    key: 'actions',
    header: 'Aktionen',
    srOnlyHeader: true,
    align: 'right',
    cell: (row) => (
      <button type="button" onClick={() => actions(row.id)}>
        Löschen {row.name}
      </button>
    ),
  },
]
const actions = vi.fn()

describe('DataTable', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de')
    actions.mockClear()
  })

  it('renders a semantic table with header and rows', () => {
    render(
      <DataTable
        columns={columns}
        rows={ITEMS}
        getRowId={(r) => r.id}
        label="Flags"
      />
    )
    const table = screen.getByRole('table', { name: 'Flags' })
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.map((h) => h.textContent)).toEqual([
      'Name',
      'Typ',
      'Aktionen',
    ])
    expect(headers[1]).toHaveClass('hidden', 'md:table-cell')
    expect(headers[2].querySelector('.sr-only')).toHaveTextContent('Aktionen')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('Dark mode')).toBeInTheDocument()
    expect(within(rows[2]).getByText('STRING')).toHaveClass('md:table-cell')
    // Rows are not focusable without onRowClick
    expect(rows[1]).not.toHaveAttribute('tabindex')
  })

  it('activates a row by click, Enter and Space but not from inner buttons', async () => {
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(
      <DataTable
        columns={columns}
        rows={ITEMS}
        getRowId={(r) => r.id}
        onRowClick={onRowClick}
      />
    )
    const rows = screen.getAllByRole('row')

    await user.click(within(rows[1]).getByText('Dark mode'))
    expect(onRowClick).toHaveBeenLastCalledWith(ITEMS[0])

    // Clicking focuses the row (it is a tab stop)
    expect(rows[1]).toHaveFocus()
    await user.tab()
    // The inner button is the next tab stop, then the second row
    expect(within(rows[1]).getByRole('button')).toHaveFocus()
    await user.tab()
    expect(rows[2]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenLastCalledWith(ITEMS[1])
    await user.keyboard(' ')
    expect(onRowClick).toHaveBeenCalledTimes(3)

    await user.click(
      within(rows[2]).getByRole('button', { name: 'Löschen Banner text' })
    )
    expect(actions).toHaveBeenCalledWith('b')
    expect(onRowClick).toHaveBeenCalledTimes(3)
  })

  it('applies rowClassName per row', () => {
    render(
      <DataTable
        columns={columns}
        rows={ITEMS}
        getRowId={(r) => r.id}
        rowClassName={(row) =>
          row.type === 'STRING' ? 'opacity-60' : undefined
        }
      />
    )
    const rows = screen.getAllByRole('row')
    expect(rows[1]).not.toHaveClass('opacity-60')
    expect(rows[2]).toHaveClass('opacity-60')
  })

  it('shows skeleton rows while loading', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={ITEMS}
        getRowId={(r) => r.id}
        loading
        loadingRows={3}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('Laden')
    // header + 3 skeleton rows, no data
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(screen.queryByText('Dark mode')).toBeNull()
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(9)
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true')
  })

  it('renders the empty content across all columns', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        empty={<p>Noch keine Flags</p>}
      />
    )
    const cell = screen.getByText('Noch keine Flags').closest('td')
    expect(cell).toHaveAttribute('colspan', '3')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
