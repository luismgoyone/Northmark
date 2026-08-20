import { describe, expect, it } from 'vitest'
import { emaAlignment } from './emaAlignment'
import { defaultConfig } from '../config'
import { longTrendWithTail, trendSeries } from '../../tests/fixtures/structureSeries'
import type { MarketContext } from '../types'

const ctxWith = (h1: MarketContext['h1']): MarketContext => ({ m5: h1, m15: h1, h1 })

describe('emaAlignment (supporting, never blocks)', () => {
  it('passes when a rising EMA9 supports a long direction', () => {
    const r = emaAlignment(ctxWith(trendSeries('up')), 'long', defaultConfig)
    expect(r.id).toBe('ema9-alignment')
    expect(r.status).toBe('pass')
  })

  it('passes when a falling EMA9 supports a short direction', () => {
    expect(emaAlignment(ctxWith(trendSeries('down')), 'short', defaultConfig).status).toBe('pass')
  })

  it('passes (neutral) when EMA9 is flat under a long direction', () => {
    // longTrendWithTail(1050, 3) plateaus → flat EMA9 slope (see bias fixtures).
    expect(emaAlignment(ctxWith(longTrendWithTail(1050, 3)), 'long', defaultConfig).status).toBe('pass')
  })

  it('withholds (wait, not fail) when a falling EMA9 opposes a long direction', () => {
    // longTrendWithTail(1044, 4) drops the tail below the settled EMA9 → falling slope.
    const r = emaAlignment(ctxWith(longTrendWithTail(1044, 4)), 'long', defaultConfig)
    expect(r.status).toBe('wait')
    expect(r.status).not.toBe('fail')
  })

  it('withholds when a rising EMA9 opposes a short direction', () => {
    expect(emaAlignment(ctxWith(trendSeries('up')), 'short', defaultConfig).status).toBe('wait')
  })
})
