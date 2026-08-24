import type { Candle } from '../types.js'

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

/**
 * Per-bar EMA as a series aligned 1:1 with `candles`.
 *
 * Same SMA-seed + smoothing as `ema()`, but emits the EMA at every bar so it can be
 * plotted as a line. Warmup bars (index < period-1) are `null` — there is no settled
 * EMA yet, and a chart line simply starts at the first real value.
 */
export function emaSeries(candles: Candle[], period: number): (number | null)[] {
  if (period < 1) {
    throw new Error(`emaSeries: period must be >= 1, got ${period}`)
  }
  const out: (number | null)[] = new Array(candles.length).fill(null)
  if (candles.length < period) return out

  let sum = 0
  for (let i = 0; i < period; i++) sum += candles[i]!.close
  let prev = sum / period
  out[period - 1] = prev

  const k = 2 / (period + 1)
  for (let i = period; i < candles.length; i++) {
    prev = candles[i]!.close * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}
