export type SessionQuality = 'prime' | 'good' | 'selective' | 'low' | 'avoid'
export type SessionWindow = { window: string; quality: SessionQuality }

const LONDON = 'Europe/London'
const NEW_YORK = 'America/New_York'

/** Local wall-clock hour (decimal, e.g. 13.5) for `ts` in `timeZone`. DST-aware via Intl. */
function localHour(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ts))
  const hour = Number(parts.find((p) => p.type === 'hour')!.value) % 24
  const minute = Number(parts.find((p) => p.type === 'minute')!.value)
  return hour + minute / 60
}

/** Short weekday name ('Mon'..'Sun') for `ts` in `timeZone`. */
function weekday(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(ts))
}

/**
 * Classify a UTC instant into a gold-trading session window + expectancy quality.
 * London active 08:00–17:00 local; New York active 08:00–17:00 local. Both active =
 * the London–NY overlap (peak). The NY 17:00–18:00 rollover is a low-liquidity dead-zone.
 */
export function classifySession(now: number): SessionWindow {
  const lh = localHour(now, LONDON)
  const nh = localHour(now, NEW_YORK)
  const londonActive = lh >= 8 && lh < 17
  const nyActive = nh >= 8 && nh < 17

  if (nh >= 17 && nh < 18) return { window: 'NY rollover', quality: 'avoid' }
  if (londonActive && nyActive) return { window: 'London–NY overlap', quality: 'prime' }
  if (londonActive) return { window: 'London session', quality: 'good' }
  if (nyActive) return { window: 'NY afternoon', quality: 'selective' }
  return { window: 'Asian / off-session', quality: 'low' }
}

/** Friday from ~15:00 New York time onward — weekend-gap risk window. */
export function isFridayLate(now: number): boolean {
  return weekday(now, NEW_YORK) === 'Fri' && localHour(now, NEW_YORK) >= 15
}
