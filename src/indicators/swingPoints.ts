import type { Candle } from '../types.js'

// Number of bars required on EACH side of a pivot for it to qualify as a swing.
// N=2 gives a classic 5-bar (Williams) fractal: the pivot plus two bars either
// side. Indices within N of either end cannot be swings (the window doesn't fit).
const N = 2

/**
 * Raw N-bar fractal detector.
 *
 * A swing high at index `i` requires `high[i]` to be STRICTLY greater than the
 * `high` of the N candles on each side. A swing low is symmetric on `low`.
 * Strictness means plateaus/ties never qualify — biasing toward fewer, cleaner
 * pivots rather than false structure.
 *
 * This is only the raw detector. HH/HL // LH/LL classification is a Phase-2 gate
 * and is intentionally NOT done here.
 *
 * @returns the indices of swing highs and swing lows (ascending).
 */
export function swingPoints(candles: Candle[]): { highs: number[]; lows: number[] } {
  const highs: number[] = []
  const lows: number[] = []

  for (let i = N; i < candles.length - N; i++) {
    const pivot = candles[i]!

    let isHigh = true
    let isLow = true

    for (let j = i - N; j <= i + N; j++) {
      if (j === i) continue
      const other = candles[j]!
      if (pivot.high <= other.high) isHigh = false
      if (pivot.low >= other.low) isLow = false
    }

    if (isHigh) highs.push(i)
    if (isLow) lows.push(i)
  }

  return { highs, lows }
}
