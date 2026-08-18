import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { ema, emaSeries } from './ema'
import risingFixture from '../../tests/fixtures/rising.json'
import fallingFixture from '../../tests/fixtures/falling.json'
import flatFixture from '../../tests/fixtures/flat.json'

const rising = risingFixture as Candle[]
const falling = fallingFixture as Candle[]
const flat = flatFixture as Candle[]

describe('ema', () => {
  describe('rising.json — clearly rising trend', () => {
    it('reports slope "rising"', () => {
      expect(ema(rising, 9).slope).toBe('rising')
    })

    it('returns the documented tail EMA9 value (≈ 2129.00)', () => {
      // Seed = SMA of first 9 closes (= 2024); k = 0.2. For a +5/bar linear
      // series the settled EMA lags close by 20, so tail = 2149 - 20 = 2129.
      expect(ema(rising, 9).value).toBeCloseTo(2129.0, 2)
    })
  })

  describe('falling.json — clearly falling trend', () => {
    it('reports slope "falling"', () => {
      expect(ema(falling, 9).slope).toBe('falling')
    })

    it('returns the documented tail EMA9 value (≈ 2021.00)', () => {
      expect(ema(falling, 9).value).toBeCloseTo(2021.0, 2)
    })
  })

  describe('flat.json — range-bound consolidation', () => {
    it('reports slope "flat" (tail slope ≈ +0.04, ~100x smaller than trending)', () => {
      expect(ema(flat, 9).slope).toBe('flat')
    })

    it('returns the documented tail EMA9 value (≈ 2049.83)', () => {
      expect(ema(flat, 9).value).toBeCloseTo(2049.83, 2)
    })
  })
})

describe('emaSeries', () => {
  const mk = (closes: number[]): Candle[] =>
    closes.map((close, i) => ({ time: i * 1000, open: close, high: close, low: close, close }))

  it('returns one entry per candle, null during the warmup period', () => {
    const out = emaSeries(mk([1, 2, 3, 4, 5]), 3)
    expect(out).toHaveLength(5)
    expect(out[0]).toBeNull()
    expect(out[1]).toBeNull()
    expect(out[2]).toBe(2) // SMA seed of first 3 closes (1+2+3)/3
    expect(out[3]).toBeCloseTo(3, 10) // 4*0.5 + 2*0.5
    expect(out[4]).toBeCloseTo(4, 10) // 5*0.5 + 3*0.5
  })

  it('is all-null when there are fewer candles than the period', () => {
    expect(emaSeries(mk([1, 2]), 3)).toEqual([null, null])
  })

  it('agrees with the scalar ema() at the final bar', () => {
    const candles = mk([10, 11, 9, 12, 13, 12, 14])
    const series = emaSeries(candles, 3)
    expect(series[series.length - 1]).toBeCloseTo(ema(candles, 3).value, 10)
  })

  it('throws when period < 1', () => {
    expect(() => emaSeries(mk([1, 2, 3]), 0)).toThrow(/period must be >= 1/)
  })
})
