import type { Candle, Config, GateResult } from '../types'

/**
 * XAUUSD pip→dollar convention pending Luis confirmation (see NORTHMARK-STATUS decision log).
 * For now: 1 pip = $0.10 on XAUUSD, so a `breakoutBufferPips` of 20 = a $2.00 buffer.
 */
const PIP = 0.1

/**
 * Breakout-close gate (MVP §4, high-value fidelity point).
 *
 * A breakout counts ONLY when the last M5 candle *closes* above `level + buffer`.
 * A wick above the level with a close at/below it is NOT a breakout — it's a failed
 * attempt. `level` is supplied by the caller (level identification is a Phase-2
 * Judgment gate), not detected here.
 *
 *  - last close  >  level + buffer                 → pass  (clean breakout)
 *  - last high   >  level  but close ≤ level+buffer → fail  (wick-only / failed breakout)
 *  - last high   ≤  level                           → wait  (no breakout attempt)
 *
 * Bias toward `wait` when there is nothing to evaluate — never a false `pass`.
 */
export function breakoutClose(candles: Candle[], level: number, config: Config): GateResult {
  const id = 'breakout-close'
  const last = candles[candles.length - 1]

  if (!last) {
    return { id, status: 'wait', detail: 'No candles supplied; cannot evaluate breakout.' }
  }

  const buffer = config.tolerances.breakoutBufferPips * PIP
  const threshold = level + buffer

  if (last.close > threshold) {
    return {
      id,
      status: 'pass',
      detail: `Close ${last.close} > level ${level} + buffer ${buffer} (threshold ${threshold}): clean breakout.`,
    }
  }

  if (last.high > level) {
    return {
      id,
      status: 'fail',
      detail: `High ${last.high} pierced level ${level} but close ${last.close} ≤ threshold ${threshold} (level + buffer ${buffer}): wick-only, failed breakout.`,
    }
  }

  return {
    id,
    status: 'wait',
    detail: `High ${last.high} ≤ level ${level}: no breakout attempt (close ${last.close}, buffer ${buffer}).`,
  }
}
