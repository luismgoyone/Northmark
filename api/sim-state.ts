// api/sim-state.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { defaultConfig } from '../src/config.js'
import { simConfigFrom } from '../src/sim/config.js'
import { initBlob, type SimBlob } from '../src/serverTick.js'

const KEY = 'sim:v2'

/** Upstash Redis from whichever env names the Vercel integration injected; null when unset. */
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const empty = initBlob(simConfigFrom(defaultConfig))
  const redis = getRedis()
  // Before provisioning (or on a transient store error) return the empty state, never 500 —
  // the client should render the empty Paper panel, not break.
  const stored = redis ? ((await redis.get<SimBlob>(KEY)) as SimBlob | null) : null
  const blob = stored ?? empty
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
  res.status(200).json({
    state: blob.state,
    claudeState: blob.claudeState,
    meta: { limitReachedAt: blob.limitReachedAt, updatedAt: blob.updatedAt },
  })
}
