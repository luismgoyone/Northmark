import { describe, expect, it } from 'vitest'
import { priceSummary } from './priceSummary'
import type { Candle } from '../types'

const c = (time: number, open: number, close: number): Candle => ({
  time,
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
})

const STEP = 5 * 60_000

describe('priceSummary', () => {
  it('returns null for an empty window', () => {
    expect(priceSummary([])).toBeNull()
  })

  it('price is the latest close; change is measured from the first candle of the latest UTC day', () => {
    const day = Date.UTC(2026, 7, 20)
    const m5 = [
      c(day + 0 * STEP, 2400, 2402), // day open = 2400
      c(day + 1 * STEP, 2402, 2410),
      c(day + 2 * STEP, 2410, 2405), // latest close = 2405
    ]
    const s = priceSummary(m5)!
    expect(s.price).toBe(2405)
    expect(s.open).toBe(2400)
    expect(s.change).toBe(5)
    expect(s.changePct).toBeCloseTo((5 / 2400) * 100, 6)
  })

  it("uses the CURRENT day's open, ignoring a prior-day candle in the window", () => {
    const prior = Date.UTC(2026, 7, 19, 23, 55) // yesterday 23:55
    const today = Date.UTC(2026, 7, 20, 0, 0) // today 00:00, open = 2500
    const m5 = [
      c(prior, 2450, 2455),
      c(today, 2500, 2510),
      c(today + STEP, 2510, 2490), // latest close = 2490
    ]
    const s = priceSummary(m5)!
    expect(s.open).toBe(2500) // today's open, not yesterday's 2450
    expect(s.price).toBe(2490)
    expect(s.change).toBe(-10)
    expect(s.changePct).toBeLessThan(0)
  })

  it('falls back to the window-first candle when every candle is on the same day', () => {
    const day = Date.UTC(2026, 7, 20, 8, 0)
    const m5 = [c(day, 3000, 3005), c(day + STEP, 3005, 3020)]
    const s = priceSummary(m5)!
    expect(s.open).toBe(3000)
    expect(s.price).toBe(3020)
    expect(s.change).toBe(20)
  })
})
