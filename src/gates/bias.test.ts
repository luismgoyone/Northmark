import { describe, expect, it } from 'vitest'
import { bias } from './bias'
import { defaultConfig } from '../config'
import { longTrendWithTail, rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'
import { ema } from '../indicators/ema'
import { structureDirection } from './structure'
import type { MarketContext } from '../types'

const ctxWith = (h1: MarketContext['h1']): MarketContext => ({ m5: h1, m15: h1, h1 })

describe('bias', () => {
  it('emits long when H1 structure rises and EMA9 does not contradict', () => {
    const { result, direction } = bias(ctxWith(trendSeries('up')), defaultConfig)
    expect(result.id).toBe('h1-m15-bias')
    expect(result.status).toBe('pass')
    expect(direction).toBe('long')
  })

  it('emits short for a falling H1', () => {
    const { direction } = bias(ctxWith(trendSeries('down')), defaultConfig)
    expect(direction).toBe('short')
  })

  it('waits with null direction when H1 is an unclear range', () => {
    const { result, direction } = bias(ctxWith(rangeSeries()), defaultConfig)
    expect(result.status).toBe('wait')
    expect(direction).toBeNull()
  })

  // The gate's core rule: EMA9 SUPPORTS but never OVERRIDES clear structure.
  // These two cases exercise the rule-defining branches directly.

  it('emits long on clear long structure even when EMA9 is flat (flat does NOT override)', () => {
    // Tail plateaus where EMA9 has settled → flat slope; structure stays long.
    const h1 = longTrendWithTail(1050, 3)
    // Precondition: we are genuinely in the "long structure + flat EMA9" branch.
    expect(structureDirection(h1)).toBe('long')
    expect(ema(h1, defaultConfig.ema.period).slope).toBe('flat')

    const { result, direction } = bias(ctxWith(h1), defaultConfig)
    expect(result.status).toBe('pass')
    expect(direction).toBe('long')
  })

  it('waits with null when EMA9 slope strongly opposes clear long structure (never flips direction)', () => {
    // Tail drops below the settled EMA9 → falling slope; structure still long.
    const h1 = longTrendWithTail(1044, 4)
    // Precondition: we are genuinely in the "long structure + falling EMA9" branch.
    expect(structureDirection(h1)).toBe('long')
    expect(ema(h1, defaultConfig.ema.period).slope).toBe('falling')

    const { result, direction } = bias(ctxWith(h1), defaultConfig)
    expect(result.status).toBe('wait')
    expect(direction).toBeNull()
  })
})
