// api/_news.ts
import type { NewsEvent } from '../src/edge/newsWindow.js'
import { parseEconomicCalendar } from '../src/edge/newsProvider.js'

/** Whether a news provider key is configured (feed active). */
export function newsConfigured(): boolean {
  return Boolean(process.env.NEWS_API_KEY)
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Fetch the economic calendar for [now, now+2d] from the configured provider (Finnhub by
 * default). Returns [] on missing key or ANY error — the feed is best-effort and never throws.
 */
export async function fetchEconomicCalendar(now: number): Promise<NewsEvent[]> {
  const key = process.env.NEWS_API_KEY
  if (!key) return []
  const provider = process.env.NEWS_PROVIDER ?? 'finnhub'
  try {
    if (provider === 'finnhub') {
      const from = ymd(now)
      const to = ymd(now + 2 * 24 * 60 * 60_000)
      const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`
      const res = await fetch(url)
      if (!res.ok) return []
      return parseEconomicCalendar(await res.json())
    }
    return []
  } catch {
    return []
  }
}
