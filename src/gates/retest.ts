import type { Candle, Config, Direction, GateResult } from '../types'

/**
 * Retest gate (checklist step 6). Requires, in order within the window:
 *   1. a breakout bar that CLOSED beyond `level` in `direction`, then
 *   2. a later bar that returned to within `retestBand` of the level and HELD it
 *      (long: low reached the band, close stayed ≥ level → old resistance now support;
 *       short: high reached the band, close stayed ≤ level → old support now resistance).
 * A return that CLOSED back through the level is a `fail` (failed retest). No return yet → `wait`.
 * retestBand is a fraction of price (config.tolerances.retestBand).
 */
export function retest(candles: Candle[], level: number, direction: Direction, config: Config): GateResult {
  const id = 'retest'
  const band = level * config.tolerances.retestBand

  const brokeAt = candles.findIndex((c) => (direction === 'long' ? c.close > level : c.close < level))
  if (brokeAt === -1) return { id, status: 'wait', detail: 'No breakout close beyond the level in the window yet.' }

  for (let i = brokeAt + 1; i < candles.length; i++) {
    const c = candles[i]!
    if (direction === 'long') {
      const touched = c.low <= level + band
      if (!touched) continue
      return c.close >= level
        ? { id, status: 'pass', detail: `Retest at bar ${i}: low ${c.low} touched band, close ${c.close} held ≥ level ${level}.` }
        : { id, status: 'fail', detail: `Failed retest at bar ${i}: close ${c.close} fell back below level ${level}.` }
    } else {
      const touched = c.high >= level - band
      if (!touched) continue
      return c.close <= level
        ? { id, status: 'pass', detail: `Retest at bar ${i}: high ${c.high} touched band, close ${c.close} held ≤ level ${level}.` }
        : { id, status: 'fail', detail: `Failed retest at bar ${i}: close ${c.close} rose back above level ${level}.` }
    }
  }
  return { id, status: 'wait', detail: 'Breakout occurred but price has not returned to the level yet.' }
}
