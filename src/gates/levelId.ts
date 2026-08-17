import type { Candle, Direction, GateResult } from '../types'
import { swingPoints } from '../indicators/swingPoints'

/**
 * The significant level price must break for `direction`:
 *   long  → nearest confirmed swing HIGH strictly above the last close
 *   short → nearest confirmed swing LOW strictly below the last close
 * "Significant" = an actual confirmed swing point (from swingPoints), not every fractal —
 * the nearest one in the breakout direction is the wall the setup is built on.
 */
export function levelId(candles: Candle[], direction: Direction): { level: number | null; result: GateResult } {
  const id = 'level-id'
  const last = candles[candles.length - 1]
  if (!last) return { level: null, result: { id, status: 'wait', detail: 'No candles; cannot identify a level.' } }

  const { highs, lows } = swingPoints(candles)

  let level: number | null = null
  if (direction === 'long') {
    const above = highs.map((i) => candles[i]!.high).filter((h) => h > last.close)
    level = above.length ? Math.min(...above) : null
  } else {
    const below = lows.map((i) => candles[i]!.low).filter((l) => l < last.close)
    level = below.length ? Math.max(...below) : null
  }

  if (level === null) {
    return { level: null, result: { id, status: 'wait', detail: `No significant ${direction === 'long' ? 'resistance above' : 'support below'} price ${last.close}. No trade.` } }
  }
  return { level, result: { id, status: 'pass', detail: `Significant ${direction === 'long' ? 'resistance' : 'support'} level ${level} identified for a ${direction} break.` } }
}
