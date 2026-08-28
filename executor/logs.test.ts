// executor/logs.test.ts — test seen()/state with an in-memory fake Redis
import { describe, expect, it } from 'vitest'
import { redisStore } from './logs'

function fakeRedis() {
  const m = new Map<string, unknown>(); const lists = new Map<string, string[]>()
  return {
    async set(k: string, v: unknown, opts?: { nx?: boolean }) { if (opts?.nx && m.has(k)) return null; m.set(k, v); return 'OK' },
    async get(k: string) { return m.get(k) ?? null },
    async lpush(k: string, v: string) { const a = lists.get(k) ?? []; a.unshift(v); lists.set(k, a); return a.length },
    async ltrim() { return 'OK' },
    async lrange(k: string, a: number, b: number) { return (lists.get(k) ?? []).slice(a, b + 1) },
  } as unknown as import('@upstash/redis').Redis
}

describe('redisStore', () => {
  it('seen() is false first time, true second (dedupe)', async () => {
    const s = redisStore(fakeRedis())
    expect(await s.seen('e1')).toBe(false)
    expect(await s.seen('e1')).toBe(true)
  })
  it('state defaults FLAT and round-trips', async () => {
    const s = redisStore(fakeRedis())
    expect(await s.getState()).toBe('FLAT')
    await s.setState('LONG'); expect(await s.getState()).toBe('LONG')
  })
})
