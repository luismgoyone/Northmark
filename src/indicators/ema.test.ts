import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { ema } from './ema'
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
