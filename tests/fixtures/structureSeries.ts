import type { Candle } from '../../src/types'

/** Build a candle from a center price; high/low straddle it by `spread`. */
function bar(time: number, center: number, spread = 1): Candle {
  return { time, open: center, high: center + spread, low: center - spread, close: center }
}

/**
 * A clean zig-zag staircase: alternating swing-low / swing-high pivots connected by short
 * monotonic ramps (2 interpolated bars each), so `swingPoints`' strict 5-bar fractal detects
 * each pivot as a genuine local extreme (not just a monotonic drift, which a fractal can never
 * classify as a pivot). For 'up': each peak is higher than the last (HH) and each trough is
 * higher than the last (HL). 'down' is the exact mirror (LH + LL).
 */
export function trendSeries(direction: 'up' | 'down', legs = 4): Candle[] {
  const sign = direction === 'up' ? 1 : -1
  const swingSize = 14
  const pullback = 4

  // Alternating trough/peak (or mirrored for 'down') pivot values: each full cycle nets
  // `swingSize - pullback` in the trend direction, so both extremes strictly progress.
  const pivots: number[] = [1000]
  for (let leg = 0; leg < legs * 2; leg++) {
    const withTrend = leg % 2 === 0
    const delta = withTrend ? sign * swingSize : -sign * pullback
    pivots.push(pivots[pivots.length - 1]! + delta)
  }

  const candles: Candle[] = []
  let time = 0
  for (let p = 0; p < pivots.length; p++) {
    candles.push(bar(time++, pivots[p]!))
    if (p < pivots.length - 1) {
      const start = pivots[p]!
      const end = pivots[p + 1]!
      // Two strictly-monotonic interpolated bars so the pivot's 2-bar window on each side
      // is unambiguous (never a tie, never a reversal within the window).
      candles.push(bar(time++, start + (end - start) / 3))
      candles.push(bar(time++, start + (end - start) * (2 / 3)))
    }
  }

  // Trailing bars continuing the trend past the final pivot, so it has a full right-hand
  // window (swingPoints requires N=2 bars on each side to qualify as a pivot).
  const last = pivots[pivots.length - 1]!
  candles.push(bar(time++, last + sign * (pullback / 2)))
  candles.push(bar(time++, last + sign * pullback))

  return candles
}

/** A flat, overlapping range: all bars share one center, no directional progression. */
export function rangeSeries(count = 20): Candle[] {
  return Array.from({ length: count }, (_v, i) => bar(i, 1000, 3))
}
