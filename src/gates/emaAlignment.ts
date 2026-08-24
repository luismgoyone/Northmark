import type { Config, Direction, GateResult, MarketContext } from '../types.js'
import { ema } from '../indicators/ema.js'

/**
 * Supporting confirmation (NEVER blocks): H1 EMA9 slope agrees with the candidate
 * direction. Long is supported by a rising or flat EMA9; short by a falling or flat one.
 * An opposing slope only WITHHOLDS this confirmation (status 'wait'), lowering the
 * confidence band — it never fails or blocks. Extracted out of `bias` per the
 * 2026-08-20 reframe so EMA9 can never veto an otherwise-valid setup.
 */
export function emaAlignment(ctx: MarketContext, direction: Direction, config: Config): GateResult {
  const id = 'ema9-alignment'
  const { slope } = ema(ctx.h1, config.ema.period)
  const opposes = (direction === 'long' && slope === 'falling') || (direction === 'short' && slope === 'rising')
  if (opposes) {
    return { id, status: 'wait', detail: `EMA9 slope ${slope} opposes ${direction} — confirmation withheld (does not block).` }
  }
  return { id, status: 'pass', detail: `EMA9 slope ${slope} supports ${direction} (or is neutral).` }
}
