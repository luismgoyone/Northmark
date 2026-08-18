import type { Candle, Direction, GateResult } from '../types'
import { swingPoints } from '../indicators/swingPoints'

/** Are the last `min` values strictly increasing? (needs ≥ `min` values) */
function strictlyIncreasing(values: number[], min = 2): boolean {
  if (values.length < min) return false
  const tail = values.slice(-min)
  return tail.every((v, i) => i === 0 || v > tail[i - 1]!)
}

function strictlyDecreasing(values: number[], min = 2): boolean {
  if (values.length < min) return false
  const tail = values.slice(-min)
  return tail.every((v, i) => i === 0 || v < tail[i - 1]!)
}

/**
 * Direction implied by market structure, or null when unclear.
 * Long  = last ≥2 swing highs AND last ≥2 swing lows both strictly increase (HH + HL).
 * Short = both strictly decrease (LH + LL). Anything mixed/insufficient → null.
 */
export function structureDirection(candles: Candle[]): Direction | null {
  const { highs, lows } = swingPoints(candles)
  const highPrices = highs.map((i) => candles[i]!.high)
  const lowPrices = lows.map((i) => candles[i]!.low)

  if (strictlyIncreasing(highPrices) && strictlyIncreasing(lowPrices)) return 'long'
  if (strictlyDecreasing(highPrices) && strictlyDecreasing(lowPrices)) return 'short'
  return null
}

/** Gate: structure confirms the candidate `direction` (≥2 HH+HL / 2 LH+LL). */
export function structure(candles: Candle[], direction: Direction): GateResult {
  const id = 'market-structure'
  const detected = structureDirection(candles)
  if (detected === direction) {
    return { id, status: 'pass', detail: `Structure confirms ${direction} (2+ ${direction === 'long' ? 'HH+HL' : 'LH+LL'}).` }
  }
  return { id, status: 'wait', detail: `Structure is ${detected ?? 'unclear'}, not the candidate ${direction}. No trade.` }
}
