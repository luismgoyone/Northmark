import { describe, expect, it } from 'vitest'
import { advanceSim, verdictToSignal } from './forwardTest'
import { initialSimState } from './sim/engine'
import { defaultConfig } from './config'
import type { SimConfig } from './sim/types'
import type { SetupVerdict } from './scoring/evaluateSetup'
import type { Candle, MarketContext } from './types'

const simConfig: SimConfig = { startingBalance: 10_000, riskPct: 0.01 }
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

// advanceSim: build a MarketContext whose evaluateSetup verdict we control by choosing candles is
// hard, so exercise the WATERMARK + stepping behavior directly with a wait-producing context
// (a single flat candle can't authorize) and assert dedup + no-op semantics.
describe('advanceSim', () => {
  const flat = bar(0, 100, 100, 100, 100)
  const ctxAt = (times: number[]): MarketContext => {
    const m5 = times.map((t) => bar(t, 100, 100, 100, 100))
    return { m5, m15: [flat], h1: [flat] }
  }

  it('steps only candles newer than the watermark and advances it to the latest time', () => {
    const s0 = initialSimState(simConfig)
    const r1 = advanceSim(s0, null, ctxAt([1, 2, 3]), defaultConfig)
    expect(r1.lastProcessedTime).toBe(3)
    // Re-running with the same candles is a no-op (nothing newer than the watermark).
    const r2 = advanceSim(r1.state, r1.lastProcessedTime, ctxAt([1, 2, 3]), defaultConfig)
    expect(r2.lastProcessedTime).toBe(3)
    expect(r2.state).toEqual(r1.state)
  })

  it('returns the same watermark and unchanged state when there are no candles', () => {
    const s0 = initialSimState(simConfig)
    const r = advanceSim(s0, 5, { m5: [], m15: [flat], h1: [flat] }, defaultConfig)
    expect(r.lastProcessedTime).toBe(5)
    expect(r.state).toBe(s0)
  })
})
