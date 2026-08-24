import type { Config, MarketContext } from './types'
import type { SetupVerdict } from './scoring/evaluateSetup'
import { evaluateSetup } from './scoring/evaluateSetup'
import { simStep, type SetupSignal } from './sim/engine'
import type { SimState } from './sim/types'

/** Map an engine verdict to the sim's narrow signal (tp2 is the paper target). */
export function verdictToSignal(verdict: SetupVerdict): SetupSignal {
  if (verdict.status === 'setup') {
    return { authorized: true, direction: verdict.direction, entry: verdict.entry, sl: verdict.sl, tp: verdict.tp2 }
  }
  return { authorized: false }
}

/**
 * Step the sim over EVERY M5 candle newer than `lastProcessedTime`, using the verdict computed
 * once from the full current context. Robust to delayed/missed ticks — a batch of new candles is
 * simply processed on the next run, so no candle (or exit) is skipped. Pure.
 *
 * Approximation (documented): exits (`settle`) read only each candle's high/low and are
 * per-candle-accurate; opens use the single current verdict. Correct for a history/win-rate tool.
 */
export function advanceSim(
  state: SimState,
  lastProcessedTime: number | null,
  ctx: MarketContext,
  config: Config,
): { state: SimState; lastProcessedTime: number | null } {
  // First run: never backfill history. Seed the watermark to the latest candle and start
  // recording forward from the next tick (no open/settle against historical candles).
  if (lastProcessedTime === null) {
    const latest = ctx.m5[ctx.m5.length - 1]
    return { state, lastProcessedTime: latest ? latest.time : null }
  }
  const signal = verdictToSignal(evaluateSetup(ctx, config))
  const simConfig = { startingBalance: state.startingBalance, riskPct: config.riskPct }
  let s = state
  let last = lastProcessedTime
  for (const candle of ctx.m5) {
    if (candle.time <= last) continue
    s = simStep(s, signal, simConfig, candle)
    last = candle.time
  }
  return { state: s, lastProcessedTime: last }
}
