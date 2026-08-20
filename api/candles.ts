import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Serverless proxy for Twelve Data `time_series`.
 *
 * The Twelve Data API key must never reach the browser bundle. This function holds
 * the key server-side (`process.env.TWELVEDATA_KEY`, no `VITE_` prefix so Vite never
 * inlines it into client code) and forwards a whitelisted subset of query params to
 * Twelve Data, passing the provider's JSON payload through verbatim.
 */

const SYMBOL = 'XAU/USD'
const BASE_URL = 'https://api.twelvedata.com/time_series'

/** Only these intervals are proxyable — keeps this endpoint from being an open relay. */
const ALLOWED_INTERVALS = new Set(['5min', '15min', '1h'])

/** Clamp `outputsize` to [1, 500] (default 200) so a caller can't waste API credits. */
function clampOutputSize(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(n)) return 200
  return Math.min(500, Math.max(1, n))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.TWELVEDATA_KEY
  if (!key || key.trim() === '') {
    res.status(500).json({ status: 'error', code: 500, message: 'Server is missing TWELVEDATA_KEY' })
    return
  }

  const intervalParam = req.query.interval
  const interval = (Array.isArray(intervalParam) ? intervalParam[0] : intervalParam) ?? '5min'

  if (!ALLOWED_INTERVALS.has(interval)) {
    res.status(400).json({
      status: 'error',
      code: 400,
      message: `Invalid interval "${interval}". Must be one of: ${Array.from(ALLOWED_INTERVALS).join(', ')}.`,
    })
    return
  }

  const outputsizeParam = req.query.outputsize
  const outputsizeRaw = Array.isArray(outputsizeParam) ? outputsizeParam[0] : outputsizeParam
  const outputsize = clampOutputSize(outputsizeRaw)

  const url =
    `${BASE_URL}?symbol=${encodeURIComponent(SYMBOL)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&outputsize=${encodeURIComponent(outputsize)}` +
    // Force UTC: Twelve Data's DEFAULT timezone for XAU/USD is not UTC (it returned times
    // ~10h ahead), but twelveData.ts parses these datetimes AS UTC. Requesting timezone=UTC
    // makes that assumption true, so the header/chart clocks land on the right wall time.
    `&timezone=UTC` +
    `&apikey=${encodeURIComponent(key)}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    // Pass the payload through verbatim regardless of upstream HTTP status: the client
    // branches on Twelve Data's own `status: 'ok' | 'error'` field, so upstream HTTP
    // errors surface there rather than being handled here.
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
    res.status(200).json(data)
  } catch (err) {
    res.status(502).json({ status: 'error', code: 502, message: String(err) })
  }
}
