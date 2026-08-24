// api/_twelvedata.ts  (underscore prefix → not a route)
import type { Candle } from '../src/types.js'
import { parseCandles, type TwelveDataValue } from '../src/data/parseCandles.js'
import { isCreditLimitError } from '../src/serverTick.js'

const SYMBOL = 'XAU/USD'
const BASE_URL = 'https://api.twelvedata.com/time_series'

/** Thrown when Twelve Data reports credits/rate exhausted, so the tick can degrade gracefully. */
export class CreditLimitError extends Error {}

/** Fetch + normalize XAU/USD candles for one interval (server-side; key from env). timezone=UTC. */
export async function fetchCandles(interval: '5min' | '15min' | '1h', outputsize: number): Promise<Candle[]> {
  const key = process.env.TWELVEDATA_KEY
  if (!key || key.trim() === '') throw new Error('Server is missing TWELVEDATA_KEY')
  const url =
    `${BASE_URL}?symbol=${encodeURIComponent(SYMBOL)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&outputsize=${encodeURIComponent(String(outputsize))}` +
    `&timezone=UTC` +
    `&apikey=${encodeURIComponent(key)}`
  const res = await fetch(url)
  const payload = (await res.json()) as unknown
  if (isCreditLimitError(payload)) throw new CreditLimitError('Twelve Data credit limit reached')
  const p = payload as { status?: string; message?: string; values?: TwelveDataValue[] }
  if (p.status === 'error') throw new Error(`Twelve Data error: ${p.message ?? 'unknown'}`)
  if (!Array.isArray(p.values)) throw new Error('Twelve Data response missing values')
  return parseCandles(p.values)
}
