import { describe, expect, it } from 'vitest'
import { evaluateSetup } from './evaluateSetup'
import { defaultConfig } from '../config'
import { rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'
import type { Candle, MarketContext } from '../types'

const ctxAll = (c: MarketContext['m5']): MarketContext => ({ m5: c, m15: c, h1: c })

function bar(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c }
}

describe('evaluateSetup', () => {
  it('waits and names the first failing gate when H1 bias is unclear', () => {
    const v = evaluateSetup(ctxAll(rangeSeries()), defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') expect(v.blockedBy).toBe('h1-m15-bias')
  })

  it('short-circuits: a clear bias but no breakout still waits, not setup', () => {
    const v = evaluateSetup(ctxAll(trendSeries('up', 6)), defaultConfig)
    expect(v.status).toBe('wait') // later gates (breakout/retest/confirmation) not satisfied by a bare trend
    expect(v.gates.some((g) => g.id === 'h1-m15-bias' && g.status === 'pass')).toBe(true)
  })

  it('always reports one GateResult per checklist row, in order', () => {
    const v = evaluateSetup(ctxAll(trendSeries('up', 6)), defaultConfig)
    expect(v.gates.map((g) => g.id)).toEqual([
      'h1-m15-bias', 'market-structure', 'consolidation', 'level-id',
      'breakout-close', 'retest', 'confirmation', 'risk-reward',
    ])
  })

  // Documented boundary finding (see task-2.6a-report.md "Escalation"): `level-id` and
  // `breakout-close`/`retest`/`confirmation` all key off the SAME array's final candle.
  // `level-id` (long) only accepts a swing high STRICTLY ABOVE the last close (a level not
  // yet broken); `breakout-close` (long) only passes when the last close is ABOVE that same
  // level. Those two requirements are mutually exclusive for one static candle array, so
  // `evaluateSetup` cannot reach `status: 'setup'` on ANY constructible m5 fixture as
  // currently composed — even a textbook base → breakout → retest → confirmation sequence
  // (mirroring tests/fixtures/breakout-retest.json) lands back at `wait`, blocked at
  // `level-id` or `breakout-close`, never at `setup`. This is a genuine composition gap in
  // the required-gate sequence, not a fixture-construction failure — flagged for Luis, not
  // fixed here (fixing it would mean changing level-id/breakout-close, out of scope for T2.6a).
  it('cannot reach status "setup" on a textbook base->breakout->retest->confirm m5 series (documented composition gap)', () => {
    const m5: Candle[] = []
    let t = 0
    // Base/consolidation: oscillate under a 2099 resistance (mirrors breakout-retest.json).
    const baseCloses = [2095, 2097, 2093, 2096, 2094, 2098, 2092, 2095, 2099, 2093, 2096, 2094, 2097, 2092, 2095, 2098, 2092, 2096, 2094, 2097]
    for (const c of baseCloses) m5.push(bar(t++, c, 2099, 2091, c))
    m5.push(bar(t++, 2100, 2107, 2100, 2106)) // breakout: closes well above 2099 + buffer
    m5.push(bar(t++, 2106, 2110, 2105, 2109)) // follow-through
    m5.push(bar(t++, 2103, 2104, 2100, 2101)) // retest: pulls back to touch 2100, holds
    m5.push(bar(t++, 2101, 2106, 2100.5, 2105)) // confirmation: bullish, closes in upper third

    // H1/M15 bias/structure: a clean uptrend so bias+structure pass, isolating the finding
    // to level-id/breakout-close rather than an unrelated bias failure.
    const ctx: MarketContext = { m5, m15: trendSeries('up', 6), h1: trendSeries('up', 6) }

    const v = evaluateSetup(ctx, defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') {
      expect(['level-id', 'breakout-close']).toContain(v.blockedBy)
    }
  })
})
