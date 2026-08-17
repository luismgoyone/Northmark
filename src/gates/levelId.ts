import type { Candle, Direction, GateResult } from '../types'
import { swingPoints } from '../indicators/swingPoints'

/**
 * The significant level price has ALREADY BROKEN for `direction` (temporal-narrative model):
 *   long  → nearest confirmed swing HIGH strictly BELOW the last close (highest cleared resistance)
 *   short → nearest confirmed swing LOW strictly ABOVE the last close (lowest broken support)
 * "Significant" = an actual confirmed swing point (from swingPoints). By the time a
 * breakout→retest→confirmation has completed, this broken level sits on the far side of price
 * and acts as the new support (long) / resistance (short) the retest holds.
 */
export function levelId(candles: Candle[], direction: Direction): { level: number | null; result: GateResult } {
  const id = 'level-id'
  const last = candles[candles.length - 1]
  if (!last) return { level: null, result: { id, status: 'wait', detail: 'No candles; cannot identify a level.' } }

  const { highs, lows } = swingPoints(candles)

  let level: number | null = null
  if (direction === 'long') {
    const below = highs.map((i) => candles[i]!.high).filter((h) => h < last.close)
    level = below.length ? Math.max(...below) : null
  } else {
    const above = lows.map((i) => candles[i]!.low).filter((l) => l > last.close)
    level = above.length ? Math.min(...above) : null
  }

  if (level === null) {
    return { level: null, result: { id, status: 'wait', detail: `No significant ${direction === 'long' ? 'broken resistance below' : 'broken support above'} price ${last.close}. No trade.` } }
  }
  return { level, result: { id, status: 'pass', detail: `Broken ${direction === 'long' ? 'resistance' : 'support'} level ${level} identified for a ${direction} setup (now acting as ${direction === 'long' ? 'support' : 'resistance'}).` } }
}
