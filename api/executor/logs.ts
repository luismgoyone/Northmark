import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { redisStore } from '../../executor/logs.js'

/** Upstash Redis from whichever env names the Vercel integration injected; null when unset. */
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}

function tokenOk(req: VercelRequest, secret: string): boolean {
  const tokenParam = req.query.token
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam
  // Length-guard then compare; secrets are short so a plain compare is acceptable here.
  return typeof token === 'string' && token.length === secret.length && token === secret
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Gate: this endpoint serves the raw/acceptance/broker logs, so it must not be public.
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) { res.status(500).json({ ok: false, error: 'server missing WEBHOOK_SECRET' }); return }
  if (!tokenOk(req, secret)) { res.status(401).json({ ok: false, error: 'unauthorized' }); return }

  const redis = getRedis()
  if (!redis) { res.status(200).json({ state: 'FLAT', acceptance: [], raw: [], broker: [], reconcile: [] }); return }
  const store = redisStore(redis)
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    state: await store.getState(),
    acceptance: await store.recent('acceptance', 25),
    raw: await store.recent('raw', 25),
    broker: await store.recent('broker', 25),
    reconcile: await store.recent('reconcile', 25),
  })
}
