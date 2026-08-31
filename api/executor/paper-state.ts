import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { redisStore } from '../../executor/logs.js'
import { emptyAccount } from '../../executor/paper.js'
import { paperToSimState } from '../../src/sim/fromPaper.js'

/** Upstash Redis from whichever env names the Vercel integration injected; null when unset. */
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}

/**
 * Public read of the V2.7.1 paper record (the free ledger of mirrored TradingView trades).
 * Carries only trade data — no secrets — so it is safe to serve unauthenticated, like /api/sim-state.
 * Never 500s pre-provision: returns an empty account when Redis is unset.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const meta = { limitReachedAt: null, updatedAt: Date.now(), newsUpdatedAt: null, newsActive: false }
  const redis = getRedis()
  const account = redis ? await redisStore(redis).getPaper() : emptyAccount()
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ state: paperToSimState(account), meta })
}
