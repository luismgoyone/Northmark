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
  const outputsize = (Array.isArray(outputsizeParam) ? outputsizeParam[0] : outputsizeParam) ?? '200'

  const url =
    `${BASE_URL}?symbol=${encodeURIComponent(SYMBOL)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&outputsize=${encodeURIComponent(outputsize)}` +
    `&apikey=${encodeURIComponent(key)}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
    res.status(200).json(data)
  } catch (err) {
    res.status(502).json({ status: 'error', code: 502, message: String(err) })
  }
}
