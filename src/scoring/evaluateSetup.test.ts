import { describe, expect, it } from 'vitest'
import { evaluateSetup } from './evaluateSetup'
import { defaultConfig } from '../config'
import { rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'
import { bias } from '../gates/bias'
import { structure } from '../gates/structure'
import { consolidation } from '../gates/consolidation'
import { levelId } from '../gates/levelId'
import type { Candle, MarketContext } from '../types'

const ctxAll = (c: MarketContext['m5']): MarketContext => ({ m5: c, m15: c, h1: c })

function bar(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c }
}

// Hand-built long narrative: an extra warm-up bar (index 0, keeps the window ≥ the EMA9
// period of 9 candles once truncated before the retest), a prior swing high H=2100 (index 3,
// a genuine N=2 fractal — strictly greater than the highs of its two neighbors on each side),
// then a bar that CLOSES above H+buffer (breakout, index 8), then a bar that dips back to
// touch H's band and CLOSES ≥ H (retest hold, index 9), then a bullish candle closing in the
// upper third of its range (confirmation, index 10). Index 8's high (2108) is deliberately
// kept BELOW index 10's high (2109) so it can never itself qualify as a swing high
// (disqualified by its right-hand neighbor), leaving H=2100 the only swing high below the
// final close. One more trailing bar (index 11) follows confirmation — realistic ("now" is
// later than the confirmation bar) and a genuine regression check: it is NOT itself bullish/
// upper-third, so the OLD last-candle-only orchestration (which re-checks `confirmation` on
// literally the newest bar) fails here, while the temporal scan correctly finds the completed
// narrative earlier in the window regardless of what happens after it.
function fullNarrative(): Candle[] {
  return [
    bar(0, 2085, 2087, 2083, 2085), // warm-up (keeps ≥9-bar windows valid when truncated)
    bar(1, 2088, 2090, 2086, 2088),
    bar(2, 2090, 2095, 2088, 2093),
    bar(3, 2095, 2100, 2093, 2098), // H: swing high 2100
    bar(4, 2097, 2096, 2093, 2094),
    bar(5, 2094, 2094, 2090, 2091),
    bar(6, 2091, 2093, 2089, 2090),
    bar(7, 2090, 2092, 2088, 2089),
    bar(8, 2099, 2108, 2098, 2107), // breakout: close 2107 > 2100 + 0.20
    bar(9, 2104, 2105, 2099.5, 2101), // retest: low touches band, close holds ≥ 2100
    bar(10, 2101, 2109, 2100.5, 2107), // confirmation: bullish, closes in upper third
    bar(11, 2107, 2108, 2104, 2105), // trailing bar: NOT a confirmation candle (close<open)
  ]
}

// Whipsaw variant: identical narrative up to the retest hold, but the FIRST bar after the
// retest closes back BELOW the level (structural invalidation) before any confirmation candle
// forms. `confirmation()` is shape-only and would happily pass the later bullish bar, so the
// engine must reject the attempt here on its own (per the Phase 2 design-spec addendum, not
// verbatim checklist.md: "a close back through the level invalidates" —
// docs/superpowers/specs/2026-08-17-northmark-phase2-design.md).
// Index 8's high (2108) becomes a swing high once the whipsaw bar is inserted, but it sits
// ABOVE the final close (2105) so `levelId` filters it out — H=2100 stays the only level.
function whipsawNarrative(): Candle[] {
  return [
    bar(0, 2085, 2087, 2083, 2085), // warm-up
    bar(1, 2088, 2090, 2086, 2088),
    bar(2, 2090, 2095, 2088, 2093),
    bar(3, 2095, 2100, 2093, 2098), // H: swing high 2100
    bar(4, 2097, 2096, 2093, 2094),
    bar(5, 2094, 2094, 2090, 2091),
    bar(6, 2091, 2093, 2089, 2090),
    bar(7, 2090, 2092, 2088, 2089),
    bar(8, 2099, 2108, 2098, 2107), // breakout: close 2107 > 2100 + 0.20
    bar(9, 2104, 2105, 2099.5, 2101), // retest: low touches band, close holds ≥ 2100
    bar(10, 2101, 2103, 2097, 2098), // WHIPSAW: closes 2098 back BELOW level 2100 → invalidation
    bar(11, 2098, 2109, 2097, 2107), // a bullish shape AFTER the re-cross — must be ignored
    bar(12, 2107, 2108, 2104, 2105), // trailing
  ]
}

// Pre-pivot variant: an early spike bar (index 0) CLOSES above level+buffer, but it happens
// chronologically BEFORE the level's swing-high pivot (index 5) even exists — a resistance
// cannot be broken before it forms. The coherent breakout is the LATER post-pivot bar
// (index 9). The scan must be bounded to `levelPivotIdx+1`, so index 0 is never selected; a
// naive scan-from-0 selects index 0 and derails into a phantom failed retest at index 1.
function prePivotNarrative(): Candle[] {
  return [
    bar(0, 2100, 2102, 2099.5, 2101), // early spike: close 2101 > level+buffer, PRE-pivot
    bar(1, 2099, 2099, 2096, 2097),
    bar(2, 2096, 2097, 2093, 2094),
    bar(3, 2094, 2096, 2092, 2093),
    bar(4, 2093, 2095, 2091, 2092),
    bar(5, 2095, 2100, 2093, 2098), // H: swing high 2100 (the level's pivot forms HERE)
    bar(6, 2094, 2096, 2092, 2093),
    bar(7, 2093, 2095, 2091, 2092),
    bar(8, 2092, 2094, 2090, 2091),
    bar(9, 2099, 2108, 2098, 2107), // real breakout: close 2107 > 2100 + 0.20, POST-pivot
    bar(10, 2104, 2105, 2099.5, 2101), // retest: low touches band, close holds ≥ 2100
    bar(11, 2101, 2109, 2100.5, 2107), // confirmation: bullish, closes in upper third
    bar(12, 2107, 2108, 2104, 2105), // trailing
  ]
}

describe('evaluateSetup', () => {
  it('waits and names the first failing gate when H1 bias is unclear', () => {
    const v = evaluateSetup(ctxAll(rangeSeries()), defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') expect(v.blockedBy).toBe('h1-m15-bias')
  })

  it('a bias-blocked verdict has exactly one fail veto: h1-bias-unclear', () => {
    const v = evaluateSetup(ctxAll(rangeSeries()), defaultConfig)
    expect(v.status).toBe('wait')
    const failing = v.vetoes.filter((veto) => veto.status === 'fail')
    expect(failing).toHaveLength(1)
    expect(failing[0]?.id).toBe('h1-bias-unclear')
  })

  it('short-circuits: a clear bias but a monotonic trend that never pulls back to retest still waits, not setup', () => {
    const v = evaluateSetup(ctxAll(trendSeries('up', 6)), defaultConfig)
    expect(v.status).toBe('wait')
    expect(v.gates.some((g) => g.id === 'h1-m15-bias' && g.status === 'pass')).toBe(true)
    // A clean staircase uptrend closes beyond an early broken level and never returns to
    // hold its tight retest band again (each leg's pullback stays well above it).
    if (v.status === 'wait') expect(v.blockedBy).toBe('retest')
  })

  it('always reports one GateResult per checklist row, in order', () => {
    const v = evaluateSetup(ctxAll(trendSeries('up', 6)), defaultConfig)
    expect(v.gates.map((g) => g.id)).toEqual([
      'h1-m15-bias', 'consolidation', 'level-id',
      'breakout-close', 'retest', 'confirmation', 'risk-reward',
    ])
  })

  it('waits at "retest" when a breakout has occurred but price has not yet returned to hold the level', () => {
    const m5 = fullNarrative().slice(0, 9) // through the breakout bar only, no retest bar yet
    const h1 = trendSeries('up', 6)
    const m15 = trendSeries('up', 6) // clean long structure, independent of the m5 narrative
    const ctx: MarketContext = { m5, m15, h1 }

    // Preconditions: bias passes on h1, structure passes on m15, consolidation/level-id pass
    // on this m5 slice.
    expect(bias(ctx).direction).toBe('long')
    expect(structure(m15, 'long').status).toBe('pass')
    expect(consolidation(m5, defaultConfig).status).toBe('pass')
    expect(levelId(m5, 'long').level).not.toBeNull()

    const v = evaluateSetup(ctx, defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') {
      expect(v.blockedBy).toBe('retest')
      expect(v.gates.find((g) => g.id === 'breakout-close')?.status).toBe('pass')
    }
  })

  it('detects the full breakout→retest→confirmation narrative and reaches status "setup" (long)', () => {
    const h1 = trendSeries('up', 6)
    const m15 = trendSeries('up', 6) // clean long structure, independent of the m5 narrative
    const m5 = fullNarrative()
    const cfg = defaultConfig

    // Prove each precondition BEFORE asserting the setup, so this is non-vacuous.
    expect(bias({ m5, m15, h1 }).direction).toBe('long')
    expect(structure(m15, 'long').status).toBe('pass')
    expect(consolidation(m5, cfg).status).toBe('pass')
    const { level } = levelId(m5, 'long')
    expect(level).not.toBeNull()
    expect(level).toBe(2100)

    const v = evaluateSetup({ m5, m15, h1 }, cfg)
    expect(v.status).toBe('setup')
    if (v.status === 'setup') {
      expect(v.direction).toBe('long')
      expect(v.sl).toBe(level)
      expect(v.entry).toBeGreaterThan(v.sl)
      expect(v.lot).toBeGreaterThan(0)
      expect(v.score.authorized).toBe(true)
      // An authorized setup passed every required gate, so no wired veto can be the active
      // blocker — zero vetoes fire.
      expect(v.vetoes.filter((veto) => veto.status === 'fail')).toHaveLength(0)
      // Both supporting confirmations agree (clean M15 structure + rising EMA9) → STRONG.
      expect(v.supporting.find((s) => s.id === 'market-structure')?.status).toBe('pass')
      expect(v.supporting.find((s) => s.id === 'ema9-alignment')?.status).toBe('pass')
      expect(v.score.band).toBe('strong')
    }
  })

  it('rejects a whipsaw: price closing back through the level after the retest invalidates the setup', () => {
    const h1 = trendSeries('up', 6)
    const m15 = trendSeries('up', 6) // clean long structure, independent of the m5 narrative
    const m5 = whipsawNarrative()
    const cfg = defaultConfig

    // Same level as the full-setup fixture; the retest still HELD before the re-cross.
    const { level } = levelId(m5, 'long')
    expect(level).toBe(2100)

    const v = evaluateSetup({ m5, m15, h1 }, cfg)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') {
      expect(v.blockedBy).toBe('confirmation')
      // The retest genuinely held — this is a post-retest invalidation, not a missing retest.
      expect(v.gates.find((g) => g.id === 'retest')?.status).toBe('pass')
      expect(v.gates.find((g) => g.id === 'confirmation')?.status).toBe('wait')
    }
  })

  it('does NOT block when M15 structure disagrees — it authorizes with a lowered (building) band', () => {
    const h1 = trendSeries('up', 6) // bias long + rising EMA9 → EMA9 supporting passes
    const m15 = rangeSeries() // M15 structure does NOT confirm long → that supporting check is withheld
    const m5 = fullNarrative()
    const cfg = defaultConfig

    // Preconditions: bias long from H1, but M15 structure independently does not confirm.
    expect(bias({ m5, m15, h1 }).direction).toBe('long')
    expect(structure(m15, 'long').status).not.toBe('pass')

    const v = evaluateSetup({ m5, m15, h1 }, cfg)
    expect(v.status).toBe('setup') // M15 structure is supporting now — it never blocks
    if (v.status === 'setup') {
      expect(v.score.authorized).toBe(true)
      expect(v.supporting.find((s) => s.id === 'market-structure')?.status).not.toBe('pass')
      expect(v.score.band).toBe('building') // authorized, but a supporting confirmation is missing
    }
  })

  it('bounds the breakout scan after the level pivot: a pre-pivot spike above the level is not the breakout', () => {
    const h1 = trendSeries('up', 6)
    const m15 = trendSeries('up', 6) // clean long structure, independent of the m5 narrative
    const m5 = prePivotNarrative()
    const cfg = defaultConfig

    // The level is the swing high at index 5; the spike at index 0 predates it.
    const { level } = levelId(m5, 'long')
    expect(level).toBe(2100)

    const v = evaluateSetup({ m5, m15, h1 }, cfg)
    // Resolving to `setup` proves the early pre-pivot spike (index 0) was NOT selected as the
    // breakout — had it been, the retest scan would start at index 1 and fail immediately
    // (index 1 closes 2097 < level), returning wait@retest instead of the real post-pivot setup.
    expect(v.status).toBe('setup')
    if (v.status === 'setup') {
      expect(v.direction).toBe('long')
      expect(v.sl).toBe(2100)
      expect(v.entry).toBeGreaterThan(v.sl)
    }
  })
})
