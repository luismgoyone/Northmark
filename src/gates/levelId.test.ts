import { describe, expect, it } from 'vitest'
import { levelId } from './levelId'
import { swingPoints } from '../indicators/swingPoints'
import type { Candle } from '../types'

/**
 * Two prior swing highs at 1010 (index 2) and 1020 (index 5), last close resting
 * at 1025 — ABOVE both, so both are already-broken resistance (temporal model).
 *
 * Hand-traced N=2 fractal (strict, needs 2 bars either side with a lower high):
 *   idx2 high=1010 vs neighbors idx0=1002, idx1=1003, idx3=1006, idx4=1005 → all lower, swing high.
 *   idx5 high=1020 vs neighbors idx3=1006, idx4=1005, idx6=1008, idx7=1007 → all lower, swing high.
 *   idx6 high=1008 is NOT a swing high: idx5=1020 > 1008 disqualifies it.
 * Index 8 (the last candle) falls outside the detector's pivot range
 * (`i < candles.length - N` = `i < 7`), so it only ever acts as a neighbor/last
 * close, never as a pivot candidate itself.
 */
const brokenResistance: Candle[] = [
  { time: 0, open: 1000, high: 1002, low: 998, close: 1000 },
  { time: 1, open: 1001, high: 1003, low: 999, close: 1001 },
  { time: 2, open: 1008, high: 1010, low: 1006, close: 1008 }, // swing high 1010
  { time: 3, open: 1004, high: 1006, low: 1002, close: 1004 },
  { time: 4, open: 1003, high: 1005, low: 1001, close: 1003 },
  { time: 5, open: 1018, high: 1020, low: 1016, close: 1018 }, // swing high 1020
  { time: 6, open: 1006, high: 1008, low: 1004, close: 1006 },
  { time: 7, open: 1005, high: 1007, low: 1003, close: 1005 },
  { time: 8, open: 1024, high: 1026, low: 1022, close: 1025 }, // last close 1025, above both
]

/**
 * Two prior swing lows at 990 (index 2) and 980 (index 5), last close resting
 * at 975 — BELOW both, so both are already-broken support (temporal model).
 *
 * Hand-traced N=2 fractal (strict, needs 2 bars either side with a higher low):
 *   idx2 low=990 vs neighbors idx0=998, idx1=997, idx3=994, idx4=995 → all higher, swing low.
 *   idx5 low=980 vs neighbors idx3=994, idx4=995, idx6=992, idx7=993 → all higher, swing low.
 *   idx6 low=992 is NOT a swing low: idx5=980 < 992 disqualifies it.
 * Index 8 (the last candle) falls outside the detector's pivot range for the
 * same reason as above.
 */
const brokenSupport: Candle[] = [
  { time: 0, open: 1000, high: 1002, low: 998, close: 1000 },
  { time: 1, open: 999, high: 1001, low: 997, close: 999 },
  { time: 2, open: 992, high: 994, low: 990, close: 992 }, // swing low 990
  { time: 3, open: 996, high: 998, low: 994, close: 996 },
  { time: 4, open: 997, high: 999, low: 995, close: 997 },
  { time: 5, open: 982, high: 984, low: 980, close: 982 }, // swing low 980
  { time: 6, open: 994, high: 996, low: 992, close: 994 },
  { time: 7, open: 995, high: 997, low: 993, close: 995 },
  { time: 8, open: 976, high: 978, low: 972, close: 975 }, // last close 975, below both
]

describe('levelId', () => {
  it('precondition: brokenResistance fixture genuinely has swing highs at 1010 and 1020', () => {
    const { highs } = swingPoints(brokenResistance)
    expect(highs).toEqual([2, 5])
    expect(highs.map((i) => brokenResistance[i]!.high)).toEqual([1010, 1020])
  })

  it('precondition: brokenSupport fixture genuinely has swing lows at 990 and 980', () => {
    const { lows } = swingPoints(brokenSupport)
    expect(lows).toEqual([2, 5])
    expect(lows.map((i) => brokenSupport[i]!.low)).toEqual([990, 980])
  })

  it('long: picks the highest swing high below price (nearest cleared resistance)', () => {
    const { level, result } = levelId(brokenResistance, 'long')
    expect(result.id).toBe('level-id')
    expect(result.status).toBe('pass')
    expect(level).toBe(1020) // nearest below close 1025 = highest of {1010, 1020}
  })

  it('long: waits when no swing high sits below price', () => {
    // Move the last close back down so BOTH swing highs (1010, 1020) sit above it.
    const noBrokenLevel = brokenResistance.map((c, i) =>
      i === brokenResistance.length - 1 ? { ...c, close: 1005 } : c
    )
    const { level, result } = levelId(noBrokenLevel, 'long')
    expect(level).toBeNull()
    expect(result.status).toBe('wait')
  })

  it('short: picks the lowest swing low above price (nearest broken support)', () => {
    const { level, result } = levelId(brokenSupport, 'short')
    expect(result.id).toBe('level-id')
    expect(result.status).toBe('pass')
    expect(level).toBe(980) // nearest above close 975 = lowest of {990, 980}
  })

  it('short: waits when no swing low sits above price', () => {
    // Move the last close back up so BOTH swing lows (990, 980) sit below it.
    const noBrokenLevel = brokenSupport.map((c, i) =>
      i === brokenSupport.length - 1 ? { ...c, close: 995 } : c
    )
    const { level, result } = levelId(noBrokenLevel, 'short')
    expect(level).toBeNull()
    expect(result.status).toBe('wait')
  })

  it('empty candles waits with null', () => {
    const { level, result } = levelId([], 'long')
    expect(level).toBeNull()
    expect(result.status).toBe('wait')
  })
})
