import { swingPoints } from './swingPoints'
import type { Candle } from '../types'
import breakoutRetest from '../../tests/fixtures/breakout-retest.json'
import rising from '../../tests/fixtures/rising.json'

// Build a Candle[] from explicit high/low arrays. open/close are placed inside
// the band and are irrelevant to fractal detection (which reads only high/low).
function candlesFrom(highs: number[], lows: number[]): Candle[] {
  return highs.map((high, i) => {
    const low = lows[i]!
    const mid = (high + low) / 2
    return { time: 1_000 + i * 300, open: mid, high, low, close: mid, volume: 100 }
  })
}

describe('swingPoints (N=2, 5-bar fractal)', () => {
  it('detects an explicit swing high and swing low at known indices', () => {
    // highs peak at index 2 (value 15); lows trough at index 6 (value 6).
    const highs = [10, 11, 15, 11, 10, 9, 8, 9, 10]
    const lows = [20, 18, 16, 14, 12, 11, 6, 11, 12]
    const candles = candlesFrom(highs, lows)

    const { highs: swingHighs, lows: swingLows } = swingPoints(candles)

    expect(swingHighs).toEqual([2])
    expect(swingLows).toEqual([6])
  })

  it('excludes indices within N (=2) of either end', () => {
    // A tall bar at index 1 cannot be a swing high: it has fewer than N bars
    // on its left, so the fractal window does not fit.
    const highs = [10, 99, 10, 10, 10, 10, 10]
    const lows = [5, 5, 5, 5, 5, 5, 5]
    const candles = candlesFrom(highs, lows)

    const { highs: swingHighs } = swingPoints(candles)

    expect(swingHighs).not.toContain(0)
    expect(swingHighs).not.toContain(1)
    expect(swingHighs).not.toContain(candles.length - 1)
    expect(swingHighs).not.toContain(candles.length - 2)
  })

  it('requires a strict (not equal) fractal — plateaus are not swings', () => {
    // Index 3 ties its neighbours on the high side, so it is NOT a swing high.
    const highs = [10, 11, 12, 12, 12, 11, 10]
    const lows = [5, 5, 5, 5, 5, 5, 5]
    const candles = candlesFrom(highs, lows)

    const { highs: swingHighs } = swingPoints(candles)

    expect(swingHighs).toEqual([])
  })

  it('finds no interior swings in a strictly monotonic (rising) series', () => {
    const candles = rising as Candle[]

    const { highs: swingHighs, lows: swingLows } = swingPoints(candles)

    expect(swingHighs).toEqual([])
    expect(swingLows).toEqual([])
  })

  it('finds a plausible swing low in the retest region of the breakout fixture', () => {
    const candles = breakoutRetest as Candle[]

    const { highs: swingHighs, lows: swingLows } = swingPoints(candles)

    // README documents a retest at indices 24-25 (level 2100 holds). The fractal
    // low sits at index 25 (low 2099, below both neighbours on each side).
    expect(swingLows.some((i) => i >= 23 && i <= 26)).toBe(true)
    // A follow-through swing high exists before the retest; detector is not empty.
    expect(swingHighs.length).toBeGreaterThan(0)
    // Every reported index is a valid interior index.
    for (const i of [...swingHighs, ...swingLows]) {
      expect(i).toBeGreaterThanOrEqual(2)
      expect(i).toBeLessThanOrEqual(candles.length - 3)
    }
  })
})
