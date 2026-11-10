import { isRuleActiveAt, nextBoundaryAfter } from './rule-schedule'

const at = (iso: string) => new Date(iso)
const FROM = at('2026-11-27T00:00:00.000Z')
const UNTIL = at('2026-11-30T00:00:00.000Z')

describe('isRuleActiveAt', () => {
  it('is always active without a window', () => {
    expect(isRuleActiveAt({}, at('2020-01-01T00:00:00Z'))).toBe(true)
    expect(isRuleActiveAt({ activeFrom: null, activeUntil: null }, FROM)).toBe(
      true
    )
  })

  it('starts exactly at activeFrom', () => {
    const rule = { activeFrom: FROM }
    expect(isRuleActiveAt(rule, at('2026-11-26T23:59:59.999Z'))).toBe(false)
    expect(isRuleActiveAt(rule, FROM)).toBe(true)
  })

  it('ends exactly at activeUntil (exclusive)', () => {
    const rule = { activeUntil: UNTIL }
    expect(isRuleActiveAt(rule, at('2026-11-29T23:59:59.999Z'))).toBe(true)
    expect(isRuleActiveAt(rule, UNTIL)).toBe(false)
  })

  it('combines both bounds', () => {
    const rule = { activeFrom: FROM, activeUntil: UNTIL }
    expect(isRuleActiveAt(rule, at('2026-11-28T12:00:00Z'))).toBe(true)
    expect(isRuleActiveAt(rule, at('2026-11-20T12:00:00Z'))).toBe(false)
    expect(isRuleActiveAt(rule, at('2026-12-01T12:00:00Z'))).toBe(false)
  })
})

describe('nextBoundaryAfter', () => {
  const rule = { activeFrom: FROM, activeUntil: UNTIL }

  it('returns the next future bound', () => {
    expect(nextBoundaryAfter(rule, at('2026-11-01T00:00:00Z'))).toEqual(FROM)
    expect(nextBoundaryAfter(rule, FROM)).toEqual(UNTIL)
    expect(nextBoundaryAfter(rule, at('2026-11-28T00:00:00Z'))).toEqual(UNTIL)
  })

  it('returns null when no bound lies in the future', () => {
    expect(nextBoundaryAfter(rule, UNTIL)).toBeNull()
    expect(nextBoundaryAfter({}, FROM)).toBeNull()
  })

  it('handles a single bound', () => {
    expect(
      nextBoundaryAfter({ activeUntil: UNTIL }, at('2026-11-01T00:00:00Z'))
    ).toEqual(UNTIL)
    expect(nextBoundaryAfter({ activeFrom: FROM }, UNTIL)).toBeNull()
  })
})
