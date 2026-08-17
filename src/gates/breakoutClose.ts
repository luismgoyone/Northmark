import type { Candle, Config, Direction, GateResult } from '../types'

/** XAUUSD pip→price: 0.01 per pip (checklist Section A). Buffer stays in PRICE units. */
const PRICE_PER_PIP = 0.01

/**
 * Breakout-close gate (checklist step 5). A breakout counts ONLY when the last candle
 * *closes* beyond `level ± buffer`. A wick beyond with a close back inside = failed breakout.
 *   long:  close > level + buffer → pass;  high > level, close ≤ level+buffer → fail
 *   short: close < level − buffer → pass;  low  < level, close ≥ level−buffer → fail
 * `buffer` is a price-unit distance from config (breakoutBufferPips × 0.01), never dollars.
 */
export function breakoutClose(candles: Candle[], level: number, direction: Direction, config: Config): GateResult {
  const id = 'breakout-close'
  const last = candles[candles.length - 1]
  if (!last) return { id, status: 'wait', detail: 'No candles supplied; cannot evaluate breakout.' }

  const buffer = config.tolerances.breakoutBufferPips * PRICE_PER_PIP

  if (direction === 'long') {
    const threshold = level + buffer
    if (last.close > threshold) return { id, status: 'pass', detail: `Close ${last.close} > level ${level} + buffer ${buffer}: clean long breakout.` }
    if (last.high > level) return { id, status: 'fail', detail: `High ${last.high} pierced ${level} but close ${last.close} ≤ ${threshold}: wick-only, failed breakout.` }
    return { id, status: 'wait', detail: `High ${last.high} ≤ level ${level}: no long breakout attempt.` }
  }

  const threshold = level - buffer
  if (last.close < threshold) return { id, status: 'pass', detail: `Close ${last.close} < level ${level} − buffer ${buffer}: clean short breakout.` }
  if (last.low < level) return { id, status: 'fail', detail: `Low ${last.low} pierced ${level} but close ${last.close} ≥ ${threshold}: wick-only, failed breakout.` }
  return { id, status: 'wait', detail: `Low ${last.low} ≥ level ${level}: no short breakout attempt.` }
}
