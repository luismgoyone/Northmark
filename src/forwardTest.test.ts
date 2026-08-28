import { describe, expect, it } from 'vitest'
import { advanceSim, claudeVerdictToSignal, verdictToSignal } from './forwardTest'
import { evaluateSetup } from './scoring/evaluateSetup'
import { initialSimState } from './sim/engine'
import { simConfigFrom } from './sim/config'
import { defaultConfig } from './config'
import type { SimConfig } from './sim/types'
import type { SetupVerdict } from './scoring/evaluateSetup'
import type { EdgeVerdict } from './scoring/evaluateSetupClaude'
import type { Candle, MarketContext } from './types'
import { trendSeries } from '../tests/fixtures/structureSeries'

// Same hand-built long narrative as src/scoring/evaluateSetup.test.ts's "detects the full
// breakout→retest→confirmation narrative" test — a genuine authorizing setup (H=2100, breakout,
// retest hold, confirmation), so pairing it with trendSeries('up', 6) on m15/h1 reaches a
// status:'setup' verdict. See that file for the bar-by-bar narrative rationale.
function fullNarrative(): Candle[] {
  return [
    bar(0, 2085, 2087, 2083, 2085),
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
    bar(11, 2107, 2108, 2104, 2105), // trailing bar
  ]
}

const simConfig: SimConfig = { startingBalance: 10_000, riskPct: 0.01, contractSize: 100 }
const bar = (time: number, o: number, h: number, l: number, c: number): Candle => ({ time, open: o, high: h, low: l, close: c })

const setup = (): SetupVerdict => ({
  status: 'setup', direction: 'long', level: 95, entry: 100, sl: 95, tp1: 105, tp2: 110, lot: 0.1,
  gates: [], supporting: [], vetoes: [], score: { passed: 7, band: 'strong', authorized: true },
})
const wait = (): SetupVerdict => ({
  status: 'wait', blockedBy: 'h1-m15-bias', direction: null,
  gates: [], supporting: [], vetoes: [], score: { passed: 0, band: 'wait', authorized: false },
})

describe('verdictToSignal', () => {
  it('maps an authorized setup to a signal using tp2 as the target', () => {
    expect(verdictToSignal(setup())).toEqual({ authorized: true, direction: 'long', entry: 100, sl: 95, tp: 110 })
  })
  it('maps a wait verdict to unauthorized', () => {
    expect(verdictToSignal(wait())).toEqual({ authorized: false })
  })
})

const gradedTradeable: EdgeVerdict = {
  status: 'graded', direction: 'long',
  session: { window: 'London–NY overlap', quality: 'prime' }, news: null,
  score: { total: 92, grade: 'A', sections: [], structureFloorApplied: false },
  setup: { entry: 100, sl: 95, tp1: 105, tp2: 110, lot: 0.1 }, tradeable: true,
}

describe('claudeVerdictToSignal', () => {
  it('authorizes an A/B graded, tradeable setup and carries entry/sl/tp2 + grade', () => {
    const sig = claudeVerdictToSignal(gradedTradeable)
    expect(sig).toEqual({ authorized: true, direction: 'long', entry: 100, sl: 95, tp: 110, grade: 'A' })
  })
  it('does not authorize a blocked verdict even with a high grade', () => {
    const blocked: EdgeVerdict = { ...gradedTradeable, status: 'blocked', blockedBy: 'news', tradeable: false }
    expect(claudeVerdictToSignal(blocked)).toEqual({ authorized: false })
  })
  it('does not authorize a graded-but-not-tradeable (C/D) setup', () => {
    const marginal: EdgeVerdict = { ...gradedTradeable, tradeable: false, score: { total: 70, grade: 'C', sections: [], structureFloorApplied: false } }
    expect(claudeVerdictToSignal(marginal)).toEqual({ authorized: false })
  })
  it('does not authorize a wait verdict', () => {
    const wait: EdgeVerdict = { status: 'wait', direction: null, blockedBy: 'consolidation', session: { window: 'x', quality: 'low' }, news: null, score: null, setup: null, tradeable: false }
    expect(claudeVerdictToSignal(wait)).toEqual({ authorized: false })
  })
})

// advanceSim: build a MarketContext whose evaluateSetup verdict we control by choosing candles is
// hard, so exercise the WATERMARK + stepping behavior directly with a wait-producing context
// (a single flat candle can't authorize) and assert dedup + no-op semantics.
describe('advanceSim', () => {
  const flat = bar(0, 100, 100, 100, 100)
  const ctxAt = (times: number[]): MarketContext => {
    const m5 = times.map((t) => bar(t, 100, 100, 100, 100))
    return { m5, m15: [flat], h1: [flat] }
  }
  // Preserve the pre-refactor behavior: the Dad signal is the verdict computed from the same ctx.
  const dadSignalFor = (ctx: MarketContext) => verdictToSignal(evaluateSetup(ctx, defaultConfig))

  it('steps only candles newer than the watermark and advances it to the latest time', () => {
    const s0 = initialSimState(simConfig)
    const ctx = ctxAt([1, 2, 3])
    const r1 = advanceSim(s0, null, ctx, defaultConfig, () => dadSignalFor(ctx))
    expect(r1.lastProcessedTime).toBe(3)
    // Re-running with the same candles is a no-op (nothing newer than the watermark).
    const r2 = advanceSim(r1.state, r1.lastProcessedTime, ctx, defaultConfig, () => dadSignalFor(ctx))
    expect(r2.lastProcessedTime).toBe(3)
    expect(r2.state).toEqual(r1.state)
  })

  it('returns the same watermark and unchanged state when there are no candles', () => {
    const s0 = initialSimState(simConfig)
    const ctx: MarketContext = { m5: [], m15: [flat], h1: [flat] }
    const r = advanceSim(s0, 5, ctx, defaultConfig, () => dadSignalFor(ctx))
    expect(r.lastProcessedTime).toBe(5)
    expect(r.state).toBe(s0)
  })

  it('never backfills on the first run, even when the current verdict is authorized', () => {
    const h1 = trendSeries('up', 6)
    const m15 = trendSeries('up', 6)
    const m5 = fullNarrative()
    const ctx: MarketContext = { m5, m15, h1 }

    const s0 = initialSimState(simConfig)
    const r1 = advanceSim(s0, null, ctx, defaultConfig, () => dadSignalFor(ctx))
    // First run must not open (or settle) a trade against the historical candles it just fetched.
    expect(r1.state.trades).toEqual([])
    expect(r1.state.open).toBeNull()
    // The watermark seeds to the latest M5 candle's time, so recording starts forward from there.
    expect(r1.lastProcessedTime).toBe(m5[m5.length - 1]!.time)

    // A second call against the SAME context (nothing newer than the seeded watermark) is a no-op.
    const r2 = advanceSim(r1.state, r1.lastProcessedTime, ctx, defaultConfig, () => dadSignalFor(ctx))
    expect(r2.lastProcessedTime).toBe(r1.lastProcessedTime)
    expect(r2.state).toEqual(r1.state)
  })

  it('opens from the passed signal, not an internally-computed one', () => {
    const config = defaultConfig
    const start = initialSimState(simConfigFrom(config))
    const ctx = ctxAt([1, 2, 3])
    // Seed the watermark first (first run never backfills).
    const seeded = advanceSim(start, null, ctx, config, () => ({ authorized: false }))
    const openSig = { authorized: true, direction: 'long', entry: 100, sl: 95, tp: 110, grade: 'B' } as const
    const nextCtx = { ...ctx, m5: [...ctx.m5, { time: (seeded.lastProcessedTime ?? 0) + 300_000, open: 100, high: 101, low: 99, close: 100 }] }
    const out = advanceSim(seeded.state, seeded.lastProcessedTime, nextCtx, config, () => openSig)
    expect(out.state.open?.grade).toBe('B')
  })

  it('evaluates per-candle: opens only on the candle its signalFn authorizes', () => {
    const config = defaultConfig
    const simConfig = simConfigFrom(config)
    const mk = (t: number, price = 100) => ({ time: t, open: price, high: price + 0.5, low: price - 0.5, close: price })
    const ctx = { m5: [mk(1), mk(2), mk(3), mk(4)], m15: [mk(1)], h1: [mk(1)] }
    const auth = { authorized: true, direction: 'long', entry: 100, sl: 99, tp: 102, grade: 'A' } as const
    const signalFn = (_c: MarketContext, t: number) => (t === 3 ? auth : ({ authorized: false } as const))
    // watermark at 0 → all four candles are "new"; only t=3 authorizes.
    const out = advanceSim(initialSimState(simConfig), 0, ctx, config, signalFn)
    expect(out.state.open?.openedAtTime).toBe(3)
    expect(out.state.open?.grade).toBe('A')
    expect(out.lastProcessedTime).toBe(4)
  })
})
