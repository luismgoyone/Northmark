import { describe, expect, it } from 'vitest'
import { bias } from './bias'
import { longTrendWithTail, rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'
import type { MarketContext } from '../types'

const ctxWith = (h1: MarketContext['h1']): MarketContext => ({ m5: h1, m15: h1, h1 })

describe('bias (pure H1 structure)', () => {
  it('emits long when H1 structure rises', () => {
    const { result, direction } = bias(ctxWith(trendSeries('up')))
    expect(result.id).toBe('h1-m15-bias')
    expect(result.status).toBe('pass')
    expect(direction).toBe('long')
  })

  it('emits short for a falling H1', () => {
    expect(bias(ctxWith(trendSeries('down'))).direction).toBe('short')
  })

  it('waits with null direction when H1 is an unclear range', () => {
    const { result, direction } = bias(ctxWith(rangeSeries()))
    expect(result.status).toBe('wait')
    expect(direction).toBeNull()
  })

  it('NO LONGER blocks on an opposing EMA9 — falling EMA9 with clean long structure still passes', () => {
    // This fixture previously forced WAIT via the old EMA9 veto; EMA9 now lives in emaAlignment.
    const { result, direction } = bias(ctxWith(longTrendWithTail(1044, 4)))
    expect(result.status).toBe('pass')
    expect(direction).toBe('long')
  })
})
