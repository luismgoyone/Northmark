// executor/pipeline.test.ts
import { describe, expect, it } from 'vitest'
import { handleSignal } from './pipeline'
import { StubExecutor } from './executor'
import type { Store, AcceptanceRecord } from './ports'
import type { PaperAccount, PositionState } from './types'
import { emptyAccount } from './paper'

function memStore(): Store & { accepts: AcceptanceRecord[] } {
  let state: PositionState = 'FLAT'; const seen = new Set<string>(); const accepts: AcceptanceRecord[] = []
  let paper: PaperAccount = emptyAccount()
  return {
    accepts,
    appendRaw: async (_body: string, _at: number) => {}, appendBroker: async () => {}, appendReconcile: async () => {}, recent: async () => [],
    appendAcceptance: async (r) => { accepts.push(r) },
    getState: async () => state, setState: async (s) => { state = s },
    seen: async (id) => { if (seen.has(id)) return true; seen.add(id); return false },
    getPaper: async () => paper, setPaper: async (a) => { paper = a },
  }
}
const body = (o: object) => JSON.stringify({ secret: 'S', timestamp: 't', symbol: 'XAUUSD', ...o })
const deps = (store: Store) => ({ store, executor: new StubExecutor(), secret: 'S', now: 1 })

describe('handleSignal', () => {
  it('accepts a valid long entry, opens (stub), advances state to LONG', async () => {
    const store = memStore()
    const rec = await handleSignal(body({ event_id: 'e1', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101.2, lot: 0.01 }), deps(store))
    expect(rec.outcome).toBe('ACCEPTED')
    expect(rec.events).toContain('LONG_ENTRY')
    expect(await store.getState()).toBe('LONG')
  })
  it('rejects a bad secret without processing', async () => {
    const store = memStore()
    const rec = await handleSignal(JSON.stringify({ secret: 'WRONG', event_id: 'e', timestamp: 't', symbol: 'XAUUSD', market_position: 'long', prev_market_position: 'flat' }), deps(store))
    expect(rec.outcome).toBe('REJECTED'); expect(rec.reason).toMatch(/auth|secret/i)
  })
  it('marks a duplicate event_id as DUPLICATE and does not change state', async () => {
    const store = memStore()
    const b = body({ event_id: 'dup', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 })
    await handleSignal(b, deps(store))
    const rec = await handleSignal(b, deps(store))
    expect(rec.outcome).toBe('DUPLICATE')
  })
  it('rejects pyramiding with a POSITION reason', async () => {
    const store = memStore()
    await handleSignal(body({ event_id: 'a', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 }), deps(store))
    const rec = await handleSignal(body({ event_id: 'b', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 }), deps(store))
    expect(rec.outcome).toBe('REJECTED'); expect(rec.reason).toMatch(/POSITION|pyramiding|already/i)
  })
  it('reversal with a bad entry rejects WITHOUT closing (validate-all-before-execute)', async () => {
    const store = memStore()
    // open LONG first
    await handleSignal(body({ event_id: 'o', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 }), deps(store))
    const closes: string[] = []
    const spyExec = { openPosition: async () => ({ status: 'stub' as const, detail: 'o' }), closePosition: async () => { closes.push('closed'); return { status: 'stub' as const, detail: 'c' } } }
    // reversal long→short but the SHORT entry has SL/TP missing → must reject, and must NOT have closed
    const rec = await handleSignal(body({ event_id: 'r', action: 'sell', market_position: 'short', prev_market_position: 'long' /* no entry/sl/tp */ }), { store, executor: spyExec, secret: 'S', now: 2 })
    expect(rec.outcome).toBe('REJECTED')
    expect(closes).toHaveLength(0) // the exit leg never executed
  })
  it('LONG exit whose broker close errors REJECTS and keeps state LONG (broker still holds it)', async () => {
    const store = memStore()
    // open LONG first (stub)
    await handleSignal(body({ event_id: 'o', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 }), deps(store))
    // long→flat EXIT whose closePosition returns status:'error'
    const spyExec = { openPosition: async () => ({ status: 'stub' as const, detail: 'o' }), closePosition: async () => ({ status: 'error' as const, detail: 'broker down' }) }
    const rec = await handleSignal(body({ event_id: 'x', action: 'sell', market_position: 'flat', prev_market_position: 'long' }), { store, executor: spyExec, secret: 'S', now: 3 })
    expect(rec.outcome).toBe('REJECTED')
    expect(rec.reason).toMatch(/BROKER/)
    expect(await store.getState()).toBe('LONG') // NOT FLAT — broker still holds the position
  })
  it('reversal long→short where EXIT fills but OPEN errors REJECTS and keeps state FLAT (broker is flat, not SHORT)', async () => {
    const store = memStore()
    // open LONG first (stub)
    await handleSignal(body({ event_id: 'o', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 }), deps(store))
    // reversal long→short: closePosition succeeds, openPosition errors
    const spyExec = { openPosition: async () => ({ status: 'error' as const, detail: 'entry rejected' }), closePosition: async () => ({ status: 'stub' as const, detail: 'c' }) }
    const rec = await handleSignal(body({ event_id: 'r', action: 'sell', market_position: 'short', prev_market_position: 'long', entry: 100, sl: 101, tp: 98.8, lot: 0.01 }), { store, executor: spyExec, secret: 'S', now: 4 })
    expect(rec.outcome).toBe('REJECTED')
    expect(rec.reason).toMatch(/BROKER/)
    expect(await store.getState()).toBe('FLAT') // NOT SHORT — broker filled the exit but the open failed
  })
})
