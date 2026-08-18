import type { Candle } from '../types'

export type StochResult = {
  k: number
  d: number
  zone: 'overbought' | 'oversold' | 'mid'
  slope: 'up' | 'down' | 'flat'
}

// Zone thresholds mirror config.stoch (overbought ≥ 80, oversold ≤ 20). Hardcoded
// here as the standard 80/20; the config carries the same values for the gate layer.
const OVERBOUGHT = 80
const OVERSOLD = 20

function mean(values: number[]): number {
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/**
 * Raw %K at absolute index `i` over the trailing `k` candles:
 *   %K = (close − lowestLow(k)) / (highestHigh(k) − lowestLow(k)) × 100.
 * A flat range (high === low) has no meaningful position, so return the neutral
 * midpoint (50) rather than dividing by zero — never a spurious 0 or 100.
 */
function rawKAt(candles: Candle[], i: number, k: number): number {
  let highest = -Infinity
  let lowest = Infinity
  for (let j = i - k + 1; j <= i; j++) {
    const c = candles[j]
    if (c === undefined) continue
    if (c.high > highest) highest = c.high
    if (c.low < lowest) lowest = c.low
  }
  const range = highest - lowest
  if (range <= 0) return 50
  const close = candles[i]?.close
  if (close === undefined) return 50
  return ((close - lowest) / range) * 100
}

// Slow %K at absolute index `i` = SMA of raw %K over the trailing `smooth` bars.
function slowKAt(candles: Candle[], i: number, k: number, smooth: number): number {
  const raws: number[] = []
  for (let j = i - smooth + 1; j <= i; j++) {
    raws.push(rawKAt(candles, j, k))
  }
  return mean(raws)
}

/**
 * Stochastic oscillator (slow). Requires enough candles to settle a `k`-lookback
 * plus `smooth` and `d` smoothing; when uncertain (too few candles), biases to a
 * neutral `mid`/`flat` read rather than a false overbought/oversold signal.
 */
export function stochastic(
  candles: Candle[],
  k: number,
  d: number,
  smooth: number,
): StochResult {
  const n = candles.length

  // Minimum bars for a settled slow %K at the tail, plus one prior bar for slope
  // and `d`-window history. Below this the read is not trustworthy → neutral WAIT.
  const minBars = k + smooth - 1 + Math.max(d, 2) - 1
  if (n < minBars) {
    return { k: 50, d: 50, zone: 'mid', slope: 'flat' }
  }

  const slowK = slowKAt(candles, n - 1, k, smooth)
  const prevSlowK = slowKAt(candles, n - 2, k, smooth)

  const dValues: number[] = []
  for (let j = n - d; j < n; j++) {
    dValues.push(slowKAt(candles, j, k, smooth))
  }
  const dLine = mean(dValues)

  const zone: StochResult['zone'] =
    slowK >= OVERBOUGHT ? 'overbought' : slowK <= OVERSOLD ? 'oversold' : 'mid'

  const slope: StochResult['slope'] =
    slowK > prevSlowK ? 'up' : slowK < prevSlowK ? 'down' : 'flat'

  return { k: slowK, d: dLine, zone, slope }
}

/**
 * Per-bar slow stochastic as a series aligned 1:1 with `candles`.
 *
 * Same `slowKAt` math as `stochastic()`, emitted at every settled bar so %K/%D can be
 * plotted in a sub-panel. Warmup bars (index < k + smooth + d - 3) are `null`: below
 * that there isn't enough history for a trustworthy read, matching the scalar
 * function's bias toward a neutral WAIT rather than a false signal.
 */
export function stochasticSeries(
  candles: Candle[],
  k: number,
  d: number,
  smooth: number,
): ({ k: number; d: number } | null)[] {
  const n = candles.length
  const out: ({ k: number; d: number } | null)[] = new Array(n).fill(null)
  const minIndex = k + smooth + d - 3
  for (let i = 0; i < n; i++) {
    if (i < minIndex) continue
    const slowK = slowKAt(candles, i, k, smooth)
    const dValues: number[] = []
    for (let j = i - d + 1; j <= i; j++) dValues.push(slowKAt(candles, j, k, smooth))
    out[i] = { k: slowK, d: mean(dValues) }
  }
  return out
}
