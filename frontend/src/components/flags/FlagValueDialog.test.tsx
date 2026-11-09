import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import {
  FlagValueDialog,
  hasUnsafeIntegers,
  normalizeFlagValue,
  normalizeNumber,
} from './FlagValueDialog'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('normalizeNumber', () => {
  it.each([
    ['1e3', '1000'],
    [' 5 ', '5'],
    ['007', '7'],
    ['-0.50', '-0.5'],
    ['42', '42'],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeNumber(raw)).toBe(expected)
  })

  it.each([
    '',
    '   ',
    'abc',
    'NaN',
    'Infinity',
    '-Infinity',
    '1e999',
  ])('rejects %j', (raw) => {
    expect(normalizeNumber(raw)).toBeNull()
  })
})

describe('normalizeFlagValue', () => {
  it('normalizes NUMBER values', () => {
    expect(normalizeFlagValue('NUMBER', '1e3')).toEqual({
      ok: true,
      value: '1000',
    })
    expect(normalizeFlagValue('NUMBER', 'x')).toEqual({
      ok: false,
      error: 'flag-value.invalid-number',
    })
  })

  it('compacts changed JSON', () => {
    expect(normalizeFlagValue('JSON', '{\n  "a": 2\n}', '{"a":1}')).toEqual({
      ok: true,
      value: '{"a":2}',
    })
  })

  it('keeps the original JSON string when the value is unchanged', () => {
    const original = '{ "b": [1, 2], "a": {"x": null} }'
    expect(
      normalizeFlagValue('JSON', '{"a":{"x":null},"b":[1,2]}', original)
    ).toEqual({ ok: true, value: original })
  })

  it('does not treat a different array order as unchanged', () => {
    expect(normalizeFlagValue('JSON', '[2,1]', '[1,2]')).toEqual({
      ok: true,
      value: '[2,1]',
    })
  })

  it('rejects invalid JSON', () => {
    const result = normalizeFlagValue('JSON', '{', '{}')
    expect(result.ok).toBe(false)
  })
})

describe('hasUnsafeIntegers', () => {
  it('flags integers beyond MAX_SAFE_INTEGER', () => {
    expect(hasUnsafeIntegers('{"id": 12345678901234567890}')).toBe(true)
    expect(hasUnsafeIntegers('[9007199254740993]')).toBe(true)
  })

  it('accepts safe integers', () => {
    expect(hasUnsafeIntegers('{"id": 9007199254740991}')).toBe(false)
    expect(hasUnsafeIntegers('{"a": 123456789012345}')).toBe(false)
    expect(hasUnsafeIntegers('{}')).toBe(false)
  })
})

function renderDialog(
  props: Partial<React.ComponentProps<typeof FlagValueDialog>> = {}
) {
  const onSave = vi.fn(() => Promise.resolve())
  render(
    <FlagValueDialog
      open
      onOpenChange={vi.fn()}
      flagType="JSON"
      flagName="Banner"
      environmentName="Development"
      initialValue='{"a":1}'
      onSave={onSave}
      {...props}
    />
  )
  return { onSave }
}

describe('FlagValueDialog', () => {
  it('warns about integers that lose precision', async () => {
    renderDialog()
    const textarea = await screen.findByLabelText('Value (JSON)')
    expect(screen.queryByText(/precision/i)).not.toBeInTheDocument()

    await userEvent.clear(textarea)
    await userEvent.type(textarea, '[[12345678901234567890]')
    expect(screen.getByText(/precision/i)).toBeInTheDocument()
  })

  it('links the error message to the field', async () => {
    renderDialog()
    const textarea = await screen.findByLabelText('Value (JSON)')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, '{{')
    await userEvent.click(screen.getByRole('button', { name: 'Save value' }))

    const alert = await screen.findByRole('alert')
    expect(textarea).toHaveAttribute('aria-describedby', alert.id)
    expect(textarea).toHaveAccessibleDescription(alert.textContent ?? '')
  })

  it('saves the original string when JSON is only reformatted', async () => {
    const { onSave } = renderDialog({ initialValue: '{"a": 1}' })
    await screen.findByLabelText('Value (JSON)')
    await userEvent.click(screen.getByRole('button', { name: 'Save value' }))
    expect(onSave).toHaveBeenCalledWith('{"a": 1}')
  })

  it('saves a normalized NUMBER', async () => {
    const { onSave } = renderDialog({ flagType: 'NUMBER', initialValue: '1' })
    const input = await screen.findByLabelText('Value (NUMBER)')
    await userEvent.clear(input)
    await userEvent.type(input, '1e3')
    await userEvent.click(screen.getByRole('button', { name: 'Save value' }))
    expect(onSave).toHaveBeenCalledWith('1000')
  })
})
