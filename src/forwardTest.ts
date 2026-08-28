import type { Config, MarketContext } from './types.js'
import type { SetupVerdict } from './scoring/evaluateSetup.js'
import type { EdgeVerdict } from './scoring/evaluateSetupClaude.js'
import { simStep, type SetupSignal } from './sim/engine.js'
import type { SimState } from './sim/types.js'

/** Map an engine verdict to the sim's narrow signal (tp2 is the paper target). */
export function verdictToSignal(verdict: SetupVerdict): SetupSignal {
  if (verdict.status === 'setup') {
    return { authorized: true, direction: verdict.direction, entry: verdict.entry, sl: verdict.sl, tp: verdict.tp2 }
  }
  return { authorized: false }
}

/**
 * Map a Claude EdgeVerdict to the sim's narrow signal. Authorizes ONLY a graded, tradeable
 * setup (grade A/B, no veto); tp2 is the paper target, matching verdictToSignal. Carries the
 * grade so the paper trade is tagged with its pre-trade quality.
 */
export function claudeVerdictToSignal(verdict: EdgeVerdict): SetupSignal {
  if (verdict.status === 'graded' && verdict.tradeable && verdict.setup && verdict.direction && verdict.score) {
    return {
      authorized: true,
      direction: verdict.direction,
      entry: verdict.setup.entry,
      sl: verdict.setup.sl,
      tp: verdict.setup.tp2,
      grade: verdict.score.grade,
    }
  }
  return { authorized: false }
}

export type SignalFn = (ctx: MarketContext, candleTime: number) => SetupSignal

/** Context as-of `time`: m5 up to index `i`, and higher timeframes with time ≤ `time` (no look-ahead). */
function sliceContextAt(ctx: MarketContext, i: number, time: number): MarketContext {
  return {
    m5: ctx.m5.slice(0, i + 1),
    m15: ctx.m15.filter((c) => c.time <= time),
    h1: ctx.h1.filter((c) => c.time <= time),
  }
}

/**
 * Step the sim over EVERY M5 candle newer than `lastProcessedTime`, re-evaluating the strategy
 * ON EACH candle (context sliced up to that candle) via `signalFn`. This makes trade-opening
 * independent of tick cadence: setups that formed between sparse ticks are caught, because each
 * candle in the gap is replayed with its own evaluation. Settle reads each candle's high/low
 * (SL-first) and is per-candle-accurate. Pure. A first run (null watermark) seeds and never backfills.
 */
export function advanceSim(
  state: SimState,
  lastProcessedTime: number | null,
  ctx: MarketContext,
  config: Config,
  signalFn: SignalFn,
): { state: SimState; lastProcessedTime: number | null } {
  // First run: never backfill history. Seed the watermark to the latest candle and start
  // recording forward from the next tick (no open/settle against historical candles).
  if (lastProcessedTime === null) {
    const latest = ctx.m5[ctx.m5.length - 1]
    return { state, lastProcessedTime: latest ? latest.time : null }
  }
  const simConfig = {
    startingBalance: state.startingBalance,
    riskPct: config.riskPct,
    contractSize: config.contractSize,
  }
  let s = state
  let last = lastProcessedTime
  for (let i = 0; i < ctx.m5.length; i++) {
    const candle = ctx.m5[i]!
    if (candle.time <= last) continue
    let signal: SetupSignal
    try {
      signal = signalFn(sliceContextAt(ctx, i, candle.time), candle.time)
    } catch {
      // Too-short window / evaluation error on this candle → no open; settle still runs.
      signal = { authorized: false }
    }
    s = simStep(s, signal, simConfig, candle)
    last = candle.time
  }
  return { state: s, lastProcessedTime: last }
}
