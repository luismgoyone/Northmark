import { describe, expect, it } from 'vitest'
import type { Direction } from '../types'
import { positionSize, takeProfits } from './risk'

describe('positionSize', () => {
  it('computes lot = (accountSize * riskPct) / (slDistance * contractSize)', () => {
    // riskDollars = 200 * 0.01 = 2.0; lot = 2.0 / (2.0 * 100) = 0.01.
    expect(positionSize(200, 0.01, 2.0, 100)).toBe(0.01)
  })

  it('returns 0 when slDistance is 0 (never divide-by-zero)', () => {
    expect(positionSize(200, 0.01, 0, 100)).toBe(0)
  })

  it('returns 0 when slDistance is negative (never a negative lot)', () => {
    expect(positionSize(200, 0.01, -2.0, 100)).toBe(0)
  })

  it('returns 0 when contractSize is 0', () => {
    expect(positionSize(200, 0.01, 2.0, 0)).toBe(0)
  })

  it('returns 0 when contractSize is negative', () => {
    expect(positionSize(200, 0.01, 2.0, -100)).toBe(0)
  })

  it('positionSize hard-fails to 0 on non-finite inputs', () => {
    expect(positionSize(NaN, 0.01, 2, 100)).toBe(0)
    expect(positionSize(200, 0.01, Infinity, 100)).toBe(0)
  })
})

describe('takeProfits', () => {
  it('computes tp1 = 1R and tp2 = 2R for a long when no S/R cap', () => {
    // entry 2100, slDistance 2 → tp1 = 2102, tp2 = 2104.
    expect(takeProfits(2100, 2, 'long', undefined)).toEqual({ tp1: 2102, tp2: 2104 })
  })

  it('caps only tp2 when nextSR sits between tp1 and tp2', () => {
    // nextSR 2103: tp1 2102 < 2103 (uncapped); tp2 2104 > 2103 → capped to 2103.
    expect(takeProfits(2100, 2, 'long', 2103)).toEqual({ tp1: 2102, tp2: 2103 })
  })

  it('caps both targets when nextSR is closer than tp1', () => {
    // nextSR 2101.5: below both computed targets → both capped to 2101.5.
    expect(takeProfits(2100, 2, 'long', 2101.5)).toEqual({ tp1: 2101.5, tp2: 2101.5 })
  })

  it('takeProfits projects downward for a short', () => {
    const { tp1, tp2 } = takeProfits(1000, 2, 'short' as Direction)
    expect(tp1).toBe(998) // entry − 1R
    expect(tp2).toBe(996) // entry − 2R
  })

  it('takeProfits caps a short target at nextSR support', () => {
    const { tp2 } = takeProfits(1000, 2, 'short' as Direction, 997) // support at 997 is nearer than 996
    expect(tp2).toBe(997)
  })
})
