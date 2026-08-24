import type { Candle } from '../types.js'
import { parseCandles, type TwelveDataValue } from './parseCandles.js'

/**
 * Twelve Data fetch layer — the ONLY module in the codebase permitted to do I/O.
 *
 * Everything downstream (indicators → gates → scoring) is pure; this module is the
 * single boundary where the network, environment, and clock are allowed to leak in.
 * It fetches XAU/USD OHLC bars from the Twelve Data `time_series` REST endpoint and
 * normalizes the provider's string-typed, newest-first payload into our canonical
 * `Candle[]` (numeric fields, ascending time).
 */

/** Timeframes the engine polls. */
export type Timeframe = 'M5' | 'M15' | 'H1'

/** Our timeframe → Twelve Data `interval` query value. */
const INTERVAL: Record<Timeframe, string> = {
  M5: '5min',
  M15: '15min',
  H1: '1h',
}

/** How many bars to request per timeframe. Enough history to seed EMA9/stochastic. */
const OUTPUT_SIZE = 200

/** Twelve Data returns either a success payload or an error object with the same `status` key. */
type TwelveDataResponse =
  | { status: 'ok'; values: TwelveDataValue[] }
  | { status: 'error'; code: number; message: string }

/**
 * Fetch and normalize XAU/USD candles for the given timeframe.
 *
 * `time` is encoded as **epoch milliseconds** (UTC). The proxy requests
 * `timezone=UTC` from Twelve Data (its default zone for XAU/USD is NOT UTC), so
 * `datetime` arrives as a UTC string like `'2026-08-14 12:05:00'`; we parse it as
 * UTC so results are stable regardless of the machine's local timezone.
 *
 * The returned array is sorted **ascending by time** (oldest first, newest last),
 * the opposite of the provider's newest-first ordering.
 *
 * Fetches go through the same-origin `/api/candles` proxy so the Twelve Data API key
 * stays server-side and never ships in the client bundle.
 *
 * @throws if Twelve Data returns an error payload (`status: 'error'`).
 */
export async function fetchCandles(tf: Timeframe): Promise<Candle[]> {
  const interval = INTERVAL[tf]
  const url = `/api/candles?interval=${interval}&outputsize=${OUTPUT_SIZE}`

  const response = await fetch(url)
  const payload = (await response.json()) as TwelveDataResponse

  if (payload.status === 'error') {
    throw new Error(`Twelve Data error (${payload.code}): ${payload.message}`)
  }

  if (!Array.isArray(payload.values)) {
    throw new Error('Twelve Data response missing `values` array; cannot normalize candles.')
  }

  return parseCandles(payload.values)
}
