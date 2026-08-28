// executor/logs.ts
import type { Redis } from '@upstash/redis'
import type { PositionState } from './types.js'
import type { AcceptanceRecord, Store } from './ports.js'

const K = {
  raw: 'exec:raw', acceptance: 'exec:acceptance', broker: 'exec:broker',
  state: 'exec:position', seen: (id: string) => `exec:seen:${id}`,
}
const CAP = 500
const SEEN_TTL = 60 * 60 * 24 // 24h

/** Redis-backed Store (Upstash). All keys namespaced exec:* — never touches sim:*. */
export function redisStore(redis: Redis): Store {
  const push = async (key: string, rec: unknown): Promise<void> => {
    await redis.lpush(key, JSON.stringify(rec))
    await redis.ltrim(key, 0, CAP - 1)
  }
  return {
    appendRaw: (body, at) => push(K.raw, { at, body }),
    appendAcceptance: (rec: AcceptanceRecord) => push(K.acceptance, rec),
    appendBroker: (rec) => push(K.broker, rec),
    getState: async () => ((await redis.get<PositionState>(K.state)) ?? 'FLAT'),
    setState: async (s) => { await redis.set(K.state, s) },
    seen: async (eventId) => {
      // SET NX + EX: returns 'OK' when newly set (not seen), null when it already existed (seen).
      const res = await redis.set(K.seen(eventId), '1', { nx: true, ex: SEEN_TTL })
      return res === null
    },
    recent: async (kind, n) => {
      const arr = await redis.lrange(K[kind], 0, n - 1)
      return arr.map((x) => (typeof x === 'string' ? JSON.parse(x) : x))
    },
  }
}
