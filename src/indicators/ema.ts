import type { Candle } from '../types'

/**
 * Exponential Moving Average (standard textbook convention).
 *
 * Seed = SMA of the first `period` closes; multiplier `k = 2 / (period + 1)`;
 * `EMA_i = close_i * k + EMA_{i-1} * (1 - k)`. Returns the latest EMA as `value`.
 *
 * `slope` compares the latest EMA against the previous one:
 *   - `rising`  if the increase exceeds `SLOPE_EPSILON`
 *   - `falling` if the decrease exceeds `SLOPE_EPSILON`
 *   - `flat`    otherwise
 *
 * SLOPE_EPSILON = 0.1 (price units). The flat fixture's tail slope is ≈ 0.04 and
 * the trending fixtures' are ≈ ±5.0 — a ~100x gap — so any threshold in between
 * classifies them correctly; 0.1 sits comfortably in that gap. Biasing an
 * ambiguous (near-zero) slope toward `flat` keeps downstream gates from reading
 * a false trend.
 *
 * Pure: no I/O, no clock, no randomness.
 */
const SLOPE_EPSILON = 0.1

export function ema(
  candles: Candle[],
  period: number,
): { value: number; slope: 'rising' | 'flat' | 'falling' } {
  if (period < 1) {
    throw new Error(`ema: period must be >= 1, got ${period}`)
  }
  if (candles.length < period) {
    throw new Error(
      `ema: need at least ${period} candles to seed EMA, got ${candles.length}`,
    )
  }

  const k = 2 / (period + 1)

  // Seed = SMA of the first `period` closes.
  let sum = 0
  for (let i = 0; i < period; i++) {
    const candle = candles[i]
    if (candle === undefined) {
      throw new Error(`ema: missing candle at index ${i}`)
    }
    sum += candle.close
  }
  let prevEma = sum / period
  let currentEma = prevEma

  // Fold in each subsequent close, tracking the previous EMA for the slope.
  for (let i = period; i < candles.length; i++) {
    const candle = candles[i]
    if (candle === undefined) {
      throw new Error(`ema: missing candle at index ${i}`)
    }
    prevEma = currentEma
    currentEma = candle.close * k + currentEma * (1 - k)
  }

  const delta = currentEma - prevEma
  const slope: 'rising' | 'flat' | 'falling' =
    delta > SLOPE_EPSILON ? 'rising' : delta < -SLOPE_EPSILON ? 'falling' : 'flat'

  return { value: currentEma, slope }
}
