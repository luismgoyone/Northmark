import { describe, it, expect } from 'vitest'
import { stochastic, stochasticSeries } from './stochastic'
import type { Candle } from '../types'
import rising from '../../tests/fixtures/rising.json'
import falling from '../../tests/fixtures/falling.json'
import flat from '../../tests/fixtures/flat.json'

const K = 14
const D = 3
const SMOOTH = 3

describe('stochastic', () => {
  it('rising series is overbought (README: slow %K ≈ 97.2, %D ≈ 97.2)', () => {
    const r = stochastic(rising as Candle[], K, D, SMOOTH)
    expect(r.k).toBeCloseTo(97.2, 0) // ±1.0
    expect(r.d).toBeCloseTo(97.2, 0)
    expect(r.zone).toBe('overbought')
  })

  it('falling series is oversold (README: slow %K ≈ 2.8, %D ≈ 2.8)', () => {
    const r = stochastic(falling as Candle[], K, D, SMOOTH)
    expect(r.k).toBeCloseTo(2.8, 0)
    expect(r.d).toBeCloseTo(2.8, 0)
    expect(r.zone).toBe('oversold')
  })

  it('flat series is mid (README: slow %K ≈ 43.3, %D ≈ 50.0)', () => {
    const r = stochastic(flat as Candle[], K, D, SMOOTH)
    expect(r.k).toBeCloseTo(43.3, 0)
    expect(r.d).toBeCloseTo(50.0, 0)
    expect(r.zone).toBe('mid')
  })

  it('flat tail is sloping down (slow %K 43.3 vs prev 50.0)', () => {
    const r = stochastic(flat as Candle[], K, D, SMOOTH)
    expect(r.slope).toBe('down')
  })

  it('turning up from oversold during a pullback: oversold zone + slope up', () => {
    // Synthetic pullback: price drops to the bottom of a fixed [2000, 2050] range
    // (deep oversold), then the last bar ticks up. Slow %K rises latest-vs-previous
    // (4.0 → 6.0) but stays ≤ 20, so zone is oversold and slope is up.
    // (The breakout-retest 22–25 slice stays mid/overbought sloping down, so it does
    // not fit this case; a minimal inline series is used per the fixtures README.)
    const closes = [
      2045, 2044, 2043, 2042, 2041, 2040, 2039, 2038, 2030, 2020, 2010, 2008, 2006,
      2004, 2003, 2002, 2001, 2006,
    ]
    const candles: Candle[] = closes.map((close, i) => ({
      time: 1723600000 + i * 300,
      open: close,
      high: 2050,
      low: 2000,
      close,
    }))
    const r = stochastic(candles, K, D, SMOOTH)
    expect(r.k).toBeCloseTo(6.0, 0)
    expect(r.zone).toBe('oversold')
    expect(r.slope).toBe('up')
  })
})

describe('stochasticSeries', () => {
  const mk = (n: number): Candle[] =>
    Array.from({ length: n }, (_, i) => {
      const base = 100 + Math.sin(i / 2) * 5
      return { time: i * 1000, open: base, high: base + 1, low: base - 1, close: base }
    })

  it('returns one entry per candle', () => {
    const out = stochasticSeries(mk(40), 14, 3, 3)
    expect(out).toHaveLength(40)
  })

  it('is null during warmup and settled after', () => {
    const out = stochasticSeries(mk(40), 14, 3, 3)
    const minIndex = 14 + 3 + 3 - 3 // 17
    expect(out[minIndex - 1]).toBeNull()
    expect(out[minIndex]).not.toBeNull()
  })

  it('keeps %K and %D within 0..100', () => {
    const out = stochasticSeries(mk(60), 14, 3, 3)
    for (const p of out) {
      if (p === null) continue
      expect(p.k).toBeGreaterThanOrEqual(0)
      expect(p.k).toBeLessThanOrEqual(100)
      expect(p.d).toBeGreaterThanOrEqual(0)
      expect(p.d).toBeLessThanOrEqual(100)
    }
  })

  it('agrees with the scalar stochastic() at the final bar', () => {
    const candles = mk(60)
    const series = stochasticSeries(candles, 14, 3, 3)
    const last = series[series.length - 1]!
    const scalar = stochastic(candles, 14, 3, 3)
    expect(last.k).toBeCloseTo(scalar.k, 8)
    expect(last.d).toBeCloseTo(scalar.d, 8)
  })
})
