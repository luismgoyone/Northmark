import type { Candle } from '../types'

export type PriceSummary = { price: number; open: number; change: number; changePct: number }

/**
 * Current price + change-since-the-UTC-day-open, derived from the M5 candle window.
 * Pure — no I/O.
 *
 * - `price` = the latest candle's close (the current price).
 * - `open`  = the OPEN of the first candle on the latest candle's UTC calendar day (the
 *             "daily open" traditional apps show), falling back to the window's first
 *             candle when the window doesn't reach back to today's midnight.
 * - `change` / `changePct` = price − open (absolute and percent).
 *
 * Returns `null` for an empty window (nothing to show).
 */
export function priceSummary(m5: Candle[]): PriceSummary | null {
  const last = m5[m5.length - 1]
  if (!last) return null
  const d = new Date(last.time)
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const openCandle = m5.find((c) => c.time >= dayStart) ?? m5[0]!
  const open = openCandle.open
  const price = last.close
  const change = price - open
  const changePct = open !== 0 ? (change / open) * 100 : 0
  return { price, open, change, changePct }
}
