// api/sim-tick.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { defaultConfig } from '../src/config'
import { simConfigFrom } from '../src/sim/config'
import { initBlob, planFetch, applyTick, applyLimit, type SimBlob } from '../src/serverTick'
import { fetchCandles, CreditLimitError } from './_twelvedata'

const KEY = 'sim:v1'
const OUTPUT_SIZE = 200

/**
 * Build the Upstash Redis client from whichever env names the Vercel integration injected —
 * `KV_REST_API_*` (blank-prefix default) or `UPSTASH_REDIS_REST_*`. Returns null when unset so the
 * handler can answer with a clean 500 instead of crashing. Replaces the deprecated @vercel/kv.
 */
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function tokenOk(req: VercelRequest): boolean {
  const secret = process.env.SIM_TICK_SECRET
  if (!secret) return false
  const tokenParam = req.query.token
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam
  // Length-guard then compare; secrets are short so a plain compare is acceptable here.
  return typeof token === 'string' && token.length === secret.length && token === secret
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!process.env.SIM_TICK_SECRET) {
    res.status(500).json({ ok: false, message: 'Server missing SIM_TICK_SECRET' })
    return
  }
  if (!tokenOk(req)) {
    res.status(401).json({ ok: false, message: 'Unauthorized' })
    return
  }

  const redis = getRedis()
  if (!redis) {
    res.status(500).json({ ok: false, message: 'Server missing Redis (KV) configuration' })
    return
  }

  const simConfig = simConfigFrom(defaultConfig)
  const now = Date.now()
  const blob = ((await redis.get<SimBlob>(KEY)) as SimBlob | null) ?? initBlob(simConfig)

  // Admin reset.
  if (req.query.reset === '1') {
    await redis.set(KEY, initBlob(simConfig))
    res.status(200).json({ ok: true, reset: true })
    return
  }

  try {
    const plan = planFetch(blob, now)
    const m5 = await fetchCandles('5min', OUTPUT_SIZE)
    const m15 = plan.m15 ? await fetchCandles('15min', OUTPUT_SIZE) : undefined
    const h1 = plan.h1 ? await fetchCandles('1h', OUTPUT_SIZE) : undefined
    const next = applyTick(blob, { m5, m15, h1 }, defaultConfig, now)
    await redis.set(KEY, next)
    res.status(200).json({ ok: true, trades: next.state.trades.length, balance: next.state.balance })
  } catch (err) {
    if (err instanceof CreditLimitError) {
      await redis.set(KEY, applyLimit(blob, now))
      res.status(200).json({ ok: true, limited: true })
      return
    }
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : 'tick failed' })
  }
}
