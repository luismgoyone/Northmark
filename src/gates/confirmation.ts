import type { Candle, Direction, GateResult } from '../types'

/**
 * Confirmation candle (checklist step 7): a genuine continuation in the breakout
 * direction, not a mere touch. Long = bullish body (close > open) closing in the upper
 * third of its high-low range; short = bearish body closing in the lower third. The
 * range-position test rejects long upper/lower wicks (indecision) that a body-only test
 * would pass.
 */
export function confirmation(candles: Candle[], direction: Direction): GateResult {
  const id = 'confirmation'
  const c = candles[candles.length - 1]
  if (!c) return { id, status: 'wait', detail: 'No candle to confirm.' }

  const range = c.high - c.low
  if (range <= 0) return { id, status: 'wait', detail: 'Zero-range candle; no confirmation.' }
  const pos = (c.close - c.low) / range // 1 = closed at the high, 0 = at the low

  if (direction === 'long') {
    if (c.close > c.open && pos >= 2 / 3) return { id, status: 'pass', detail: `Bullish continuation: close ${c.close} > open ${c.open}, closed in upper third (${pos.toFixed(2)}).` }
    return { id, status: 'wait', detail: `No bullish confirmation (close>open=${c.close > c.open}, pos=${pos.toFixed(2)}).` }
  }
  if (c.close < c.open && pos <= 1 / 3) return { id, status: 'pass', detail: `Bearish continuation: close ${c.close} < open ${c.open}, closed in lower third (${pos.toFixed(2)}).` }
  return { id, status: 'wait', detail: `No bearish confirmation (close<open=${c.close < c.open}, pos=${pos.toFixed(2)}).` }
}
