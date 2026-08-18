import type { Candle } from '../types'

export function bar(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c }
}

/** Build a candle from a center price; high/low straddle it by `spread`. */
function centerBar(time: number, center: number, spread = 1): Candle {
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
    candles.push(centerBar(time++, pivots[p]!))
    if (p < pivots.length - 1) {
      const start = pivots[p]!
      const end = pivots[p + 1]!
      // Two strictly-monotonic interpolated bars so the pivot's 2-bar window on each side
      // is unambiguous (never a tie, never a reversal within the window).
      candles.push(centerBar(time++, start + (end - start) / 3))
      candles.push(centerBar(time++, start + (end - start) * (2 / 3)))
    }
  }

  // Trailing bars continuing the trend past the final pivot, so it has a full right-hand
  // window (swingPoints requires N=2 bars on each side to qualify as a pivot).
  const last = pivots[pivots.length - 1]!
  candles.push(centerBar(time++, last + sign * (pullback / 2)))
  candles.push(centerBar(time++, last + sign * pullback))

  return candles
}

/** A flat, overlapping range: all bars share one center, no directional progression. */
export function rangeSeries(count = 20): Candle[] {
  return Array.from({ length: count }, (_v, i) => centerBar(i, 1000, 3))
}

/** Hand-built long narrative that drives evaluateSetup to a full authorized setup. */
export function fullNarrative(): Candle[] {
  return [
    bar(0, 2085, 2087, 2083, 2085),
    bar(1, 2088, 2090, 2086, 2088),
    bar(2, 2090, 2095, 2088, 2093),
    bar(3, 2095, 2100, 2093, 2098), // H: swing high 2100
    bar(4, 2097, 2096, 2093, 2094),
    bar(5, 2094, 2094, 2090, 2091),
    bar(6, 2091, 2093, 2089, 2090),
    bar(7, 2090, 2092, 2088, 2089),
    bar(8, 2099, 2108, 2098, 2107), // breakout: close 2107 > 2100 + 0.20
    bar(9, 2104, 2105, 2099.5, 2101), // retest: low touches band, close holds ≥ 2100
    bar(10, 2101, 2109, 2100.5, 2107), // confirmation: bullish, upper third
    bar(11, 2107, 2108, 2104, 2105), // trailing (not a confirmation candle)
  ]
}
