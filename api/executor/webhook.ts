import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { redisStore } from '../../executor/logs.js'
import { PaperExecutor } from '../../executor/paper.js'
import { MetaApiExecutor } from '../../executor/metaapi.js'
import { executionGate } from '../../executor/gate.js'
import { symbolFor } from '../../executor/validate.js'
import { handleSignal } from '../../executor/pipeline.js'
import type { Executor } from '../../executor/ports.js'

/** Upstash Redis from whichever env names the Vercel integration injected; null when unset. */
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return }
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) { res.status(500).json({ ok: false, error: 'server missing WEBHOOK_SECRET' }); return }
  const redis = getRedis()
  if (!redis) { res.status(500).json({ ok: false, error: 'server missing Redis' }); return }
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
  const store = redisStore(redis)
  // Pick the executor from the gate: real MetaApi (demo) only when explicitly enabled + creds present.
  // Otherwise the free PaperExecutor — records the signal as a paper trade, no broker, no cost.
  const gate = executionGate(process.env)
  const executor: Executor = gate.enabled
    ? new MetaApiExecutor({ token: process.env.METAAPI_TOKEN!, accountId: process.env.METAAPI_ACCOUNT_ID!, symbol: symbolFor('XAUUSD'), allowLive: process.env.EXEC_ALLOW_LIVE === 'true' })
    : new PaperExecutor(store)
  const rec = await handleSignal(rawBody, { store, executor, secret, now: Date.now() })
  // Always 200 so TradingView doesn't retry-storm; the acceptance record carries the real outcome.
  res.status(200).json({ ok: rec.outcome !== 'REJECTED', outcome: rec.outcome, reason: rec.reason, events: rec.events, mode: gate.enabled ? 'live-demo' : 'paper' })
}
