import { describe, expect, it } from 'vitest'
import { breakevenWinRate, expectancyR } from './expectancy'

describe('expectancy', () => {
  it('computes expectancy in R with a fixed 1R loss', () => {
    // (0.45 × 1.5) − (0.55 × 1) = 0.125
    expect(expectancyR(0.45, 1.5)).toBeCloseTo(0.125, 6)
  })
  it('computes the breakeven win rate for an R:R', () => {
    expect(breakevenWinRate(1.5)).toBeCloseTo(0.4, 6) // 1 / (1 + 1.5)
    expect(breakevenWinRate(1)).toBeCloseTo(0.5, 6)
  })
})
