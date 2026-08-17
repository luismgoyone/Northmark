import { describe, expect, it } from 'vitest'
import { levelId } from './levelId'
import type { Candle } from '../types'

/** Two prior swing highs at 1010 and 1020, price now resting at 1005 below both. */
const belowResistance: Candle[] = [
  { time: 0, open: 1000, high: 1002, low: 998, close: 1000 },
  { time: 1, open: 1001, high: 1003, low: 999, close: 1001 },
  { time: 2, open: 1008, high: 1010, low: 1006, close: 1008 }, // swing high 1010
  { time: 3, open: 1004, high: 1006, low: 1002, close: 1004 },
  { time: 4, open: 1003, high: 1005, low: 1001, close: 1003 },
  { time: 5, open: 1018, high: 1020, low: 1016, close: 1018 }, // swing high 1020
  { time: 6, open: 1006, high: 1008, low: 1004, close: 1006 },
  { time: 7, open: 1005, high: 1007, low: 1003, close: 1005 }, // last close 1005
]

describe('levelId', () => {
  it('picks the nearest swing high above price for a long', () => {
    const { level, result } = levelId(belowResistance, 'long')
    expect(result.id).toBe('level-id')
    expect(result.status).toBe('pass')
    expect(level).toBe(1010) // nearest of {1010, 1020} above close 1005
  })

  it('waits with null when no swing sits above price', () => {
    const rising = belowResistance.map((c) => ({ ...c, close: 9999 }))
    const { level, result } = levelId(rising, 'long')
    expect(level).toBeNull()
    expect(result.status).toBe('wait')
  })
})
