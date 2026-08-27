import type { NewsEvent } from './newsWindow.js'

/** ISO-2 country → FX currency for the events we care about; unknown → the code itself. */
const COUNTRY_CCY: Record<string, string> = {
  US: 'USD', EU: 'EUR', DE: 'EUR', FR: 'EUR', GB: 'GBP', UK: 'GBP',
  JP: 'JPY', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CN: 'CNY',
}

function impactOf(raw: unknown): NewsEvent['impact'] {
  const s = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (s.includes('high') || s === '3') return 'high'
  if (s.includes('medium') || s.includes('med') || s === '2') return 'medium'
  return 'low'
}

/** Parse a time that may be an ISO/space string (assumed UTC) or epoch seconds/ms → epoch ms, or null. */
function timeMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw // seconds vs ms heuristic
  }
  if (typeof raw === 'string') {
    // Assume UTC whenever no timezone is given: "2026-08-28 12:30:00" and
    // "2026-08-28T12:30:00" both get a trailing "Z"; explicit offsets are kept.
    const withT = raw.replace(' ', 'T')
    const hasOffset = /(Z|[+-]\d{2}:\d{2})$/.test(withT)
    const iso = hasOffset ? withT : withT + 'Z'
    const t = Date.parse(iso)
    return Number.isNaN(t) ? null : t
  }
  return null
}

type RawEvent = { time?: unknown; country?: unknown; currency?: unknown; event?: unknown; title?: unknown; impact?: unknown }

function toEvent(r: RawEvent): NewsEvent | null {
  const time = timeMs(r.time)
  if (time === null) return null
  const country = typeof r.country === 'string' ? r.country.toUpperCase() : ''
  const currency =
    typeof r.currency === 'string' && r.currency ? r.currency.toUpperCase() : (COUNTRY_CCY[country] ?? country)
  const title = typeof r.event === 'string' ? r.event : typeof r.title === 'string' ? r.title : 'Economic event'
  return { time, impact: impactOf(r.impact), currency, title }
}

/**
 * Defensively parse an economic-calendar payload into NewsEvent[]. Accepts a Finnhub-style
 * `{ economicCalendar: [...] }` object or a bare array; tolerates string or epoch times and
 * missing fields. Unparseable entries are skipped (never throws). Pure.
 */
export function parseEconomicCalendar(raw: unknown): NewsEvent[] {
  const list: unknown = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { economicCalendar?: unknown }).economicCalendar)
      ? (raw as { economicCalendar: unknown[] }).economicCalendar
      : null
  if (!Array.isArray(list)) return []
  const out: NewsEvent[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const ev = toEvent(item as RawEvent)
    if (ev) out.push(ev)
  }
  return out
}
