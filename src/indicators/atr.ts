import type { Candle } from '../types.js'

/** True Range of `curr` given the previous candle's close. */
function trueRange(curr: Candle, prevClose: number): number {
  return Math.max(curr.high - curr.low, Math.abs(curr.high - prevClose), Math.abs(curr.low - prevClose))
}

/**
 * Average True Range over the last `period` bars (simple mean of True Range).
 * Needs at least `period + 1` candles (the first TR needs a previous close). Pure.
 */
export function atr(candles: Candle[], period: number): number {
  if (period < 1) throw new Error(`atr: period must be >= 1, got ${period}`)
  if (candles.length < period + 1) {
    throw new Error(`atr: need at least ${period + 1} candles, got ${candles.length}`)
  }
  let sum = 0
  for (let i = candles.length - period; i < candles.length; i++) {
    sum += trueRange(candles[i]!, candles[i - 1]!.close)
  }
  return sum / period
}
