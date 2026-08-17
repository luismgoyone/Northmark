import { describe, expect, it } from 'vitest'
import { retest } from './retest'
import { defaultConfig } from '../config'
import type { Candle } from '../types'

const level = 1000
// breakout up to 1005, pull back to touch 1000 and hold (close 1001).
const holds: Candle[] = [
  { time: 0, open: 998, high: 999, low: 997, close: 998 },
  { time: 1, open: 1004, high: 1006, low: 1003, close: 1005 }, // breakout close > level
  { time: 2, open: 1002, high: 1003, low: 1000.2, close: 1001 }, // retest touches band, holds above
]
// same breakout, but the pullback closes back below the level → failed retest.
const fails: Candle[] = [
  holds[0]!, holds[1]!,
  { time: 2, open: 1001, high: 1002, low: 996, close: 997 },
]

// breakdown to 995, pull back up to touch 1000 and hold as resistance (close 998).
const shortHolds: Candle[] = [
  { time: 0, open: 1002, high: 1003, low: 1001, close: 1002 },
  { time: 1, open: 999, high: 1000, low: 994, close: 995 }, // breakdown close < level
  { time: 2, open: 997, high: 999.8, low: 997, close: 998 }, // retest touches band, holds below
]
// same breakdown, but the pullback closes back above the level → failed retest.
const shortFails: Candle[] = [
  shortHolds[0]!, shortHolds[1]!,
  { time: 2, open: 998, high: 1002, low: 997, close: 1002 },
]

describe('retest', () => {
  it('passes when price returns to the level and holds it as support (long)', () => {
    const r = retest(holds, level, 'long', defaultConfig)
    expect(r.id).toBe('retest')
    expect(r.status).toBe('pass')
  })
  it('fails when the pullback closes back through the level', () => {
    expect(retest(fails, level, 'long', defaultConfig).status).toBe('fail')
  })
  it('waits when no pullback to the level has happened yet', () => {
    expect(retest(holds.slice(0, 2), level, 'long', defaultConfig).status).toBe('wait')
  })

  it('passes when price returns to the level and holds it as resistance (short)', () => {
    const r = retest(shortHolds, level, 'short', defaultConfig)
    expect(r.id).toBe('retest')
    expect(r.status).toBe('pass')
  })
  it('fails when the short pullback closes back through the level', () => {
    expect(retest(shortFails, level, 'short', defaultConfig).status).toBe('fail')
  })
  it('waits when no short pullback to the level has happened yet', () => {
    expect(retest(shortHolds.slice(0, 2), level, 'short', defaultConfig).status).toBe('wait')
  })
})
