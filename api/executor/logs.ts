import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { redisStore } from '../../executor/logs.js'

/** Upstash Redis from whichever env names the Vercel integration injected; null when unset. */
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const redis = getRedis()
  if (!redis) { res.status(200).json({ state: 'FLAT', acceptance: [], raw: [], broker: [] }); return }
  const store = redisStore(redis)
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    state: await store.getState(),
    acceptance: await store.recent('acceptance', 25),
    raw: await store.recent('raw', 25),
    broker: await store.recent('broker', 25),
  })
}
