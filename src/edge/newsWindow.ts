export type NewsEvent = { time: number; impact: 'high' | 'medium' | 'low'; currency: string; title: string }

const WINDOW_MS = 30 * 60_000
const RELEVANT = new Set(['USD', 'XAU', 'GOLD', 'ALL'])

/** The first high-impact USD/gold event within ±30 min of `now`, or null. Pure. */
export function newsBlackout(events: NewsEvent[], now: number): NewsEvent | null {
  for (const ev of events) {
    if (ev.impact !== 'high') continue
    if (!RELEVANT.has(ev.currency.toUpperCase())) continue
    if (Math.abs(ev.time - now) <= WINDOW_MS) return ev
  }
  return null
}
