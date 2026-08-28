// executor/parse.test.ts
import { describe, expect, it } from 'vitest'
import { parseSignal } from './parse'
import { ExecError } from './errors'

const base = {
  event_id: 'e1', timestamp: '2026-08-29T00:00:00Z', symbol: 'XAUUSD',
  action: 'sell', market_position: 'short', prev_market_position: 'flat',
  entry: '4600.5', sl: '4602.0', tp: '4598.1', lot: '0.01', setup_strength: 'strong', secret: 's',
}

describe('parseSignal', () => {
  it('coerces string numerics and maps snake_case → typed Signal', () => {
    const s = parseSignal(base)
    expect(s).toMatchObject({ eventId: 'e1', symbol: 'XAUUSD', action: 'sell', marketPosition: 'short', prevMarketPosition: 'flat', entry: 4600.5, sl: 4602, tp: 4598.1, lot: 0.01 })
  })
  it('tolerates missing sl/tp/lot (Phase-1 pre-Pine-change)', () => {
    const { entry: _e, sl: _s, tp: _t, lot: _l, ...rest } = base
    expect(parseSignal(rest).sl).toBeUndefined()
  })
  it('throws DATA on non-object', () => {
    expect(() => parseSignal('nope')).toThrow(ExecError)
  })
  it('throws DATA when required fields are absent', () => {
    expect(() => parseSignal({ symbol: 'XAUUSD' })).toThrow(/market_position|event_id/)
  })
  it('rejects an unknown marketPosition', () => {
    expect(() => parseSignal({ ...base, market_position: 'sideways' })).toThrow(ExecError)
  })
})
