import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { redisStore } from '../../executor/logs.js'
import { executionGate } from '../../executor/gate.js'
import { MetaApiExecutor } from '../../executor/metaapi.js'
import { reconcile } from '../../executor/reconcile.js'
import { symbolFor } from '../../executor/validate.js'

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}
function tokenOk(req: VercelRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET
  const t = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token
  return Boolean(secret) && typeof t === 'string' && t.length === secret!.length && t === secret
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!process.env.WEBHOOK_SECRET) { res.status(500).json({ ok: false, error: 'server missing WEBHOOK_SECRET' }); return }
  if (!tokenOk(req)) { res.status(401).json({ ok: false, error: 'unauthorized' }); return }
  const redis = getRedis()
  if (!redis) { res.status(500).json({ ok: false, error: 'server missing Redis' }); return }
  const store = redisStore(redis)
  const gate = executionGate(process.env)
  if (!gate.enabled) { res.status(200).json({ ok: true, enabled: false, reason: gate.reason }); return }
  try {
    const executor = new MetaApiExecutor({ token: process.env.METAAPI_TOKEN!, accountId: process.env.METAAPI_ACCOUNT_ID!, symbol: symbolFor('XAUUSD'), allowLive: process.env.EXEC_ALLOW_LIVE === 'true' })
    const positions = await executor.listPositions()
    const report = reconcile(await store.getState(), positions)
    await store.appendReconcile({ at: Date.now(), ...report })
    res.status(200).json({ ok: true, enabled: true, report })
  } catch (err) {
    const rec = { at: Date.now(), error: err instanceof Error ? err.message : 'reconcile failed' }
    await store.appendReconcile(rec)
    res.status(200).json({ ok: false, enabled: true, ...rec })
  }
}
