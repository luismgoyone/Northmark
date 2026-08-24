import type { Candle } from '../types'

/** Raw shape of a single value row in a successful Twelve Data response. */
export type TwelveDataValue = {
  datetime: string
  open: string
  high: string
  low: string
  close: string
  volume?: string
}

/**
 * Parse a Twelve Data `datetime` string as UTC epoch milliseconds. Twelve Data returns
 * space-separated timestamps (`'2026-08-14 12:05:00'`) with no zone; we request timezone=UTC
 * and treat them as UTC so parsing is deterministic across machines.
 */
function parseUtcMillis(datetime: string): number {
  const iso = datetime.includes(' ')
    ? `${datetime.replace(' ', 'T')}Z`
    : datetime
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    throw new Error(`Unparseable Twelve Data datetime: "${datetime}".`)
  }
  return ms
}

function normalizeValue(v: TwelveDataValue): Candle {
  const candle: Candle = {
    time: parseUtcMillis(v.datetime),
    open: Number(v.open),
    high: Number(v.high),
    low: Number(v.low),
    close: Number(v.close),
  }
  if (v.volume !== undefined && v.volume !== '') candle.volume = Number(v.volume)
  return candle
}

/** Normalize Twelve Data's newest-first string rows into ascending numeric `Candle[]`. */
export function parseCandles(values: TwelveDataValue[]): Candle[] {
  return values.map(normalizeValue).sort((a, b) => a.time - b.time)
}
