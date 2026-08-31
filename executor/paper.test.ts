// executor/paper.test.ts
import { describe, expect, it } from 'vitest'
import { PaperExecutor, emptyAccount, PAPER_START } from './paper'
import type { PaperAccount, BrokerOrder } from './types'
import type { Store } from './ports'

/** In-memory Store — only paper get/set matter to PaperExecutor; the rest are inert. */
function fakeStore(initial: PaperAccount = emptyAccount()): Store {
  let paper = initial
  return {
    appendRaw: async () => {}, appendAcceptance: async () => {}, appendBroker: async () => {},
    appendReconcile: async () => {}, getState: async () => 'FLAT', setState: async () => {},
    seen: async () => false, recent: async () => [],
    getPaper: async () => paper,
    setPaper: async (a) => { paper = a },
  }
}

const clock = (): (() => number) => { let t = 1000; return () => (t += 1000) }
const longOrder: BrokerOrder = { symbol: 'XAUUSDm', direction: 'long', entry: 100, sl: 95, tp: 110, lot: 0.01 }
const shortOrder: BrokerOrder = { symbol: 'XAUUSDm', direction: 'short', entry: 100, sl: 105, tp: 90, lot: 0.01 }

describe('PaperExecutor', () => {
  it('opens a paper position with computed dollar risk', async () => {
    const store = fakeStore()
    const px = new PaperExecutor(store, { now: clock() })
    const out = await px.openPosition(longOrder, 'e1')
    expect(out.status).toBe('paper')
    const acct = await store.getPaper()
    // risk = |100-95| * 100 * 0.01 = 5
    expect(acct.open).toMatchObject({ eventId: 'e1', direction: 'long', entry: 100, sl: 95, tp: 110, lot: 0.01, risk: 5 })
  })

  it('closes a long WIN at TP: +2R, +$10, balance grows', async () => {
    const store = fakeStore()
    const px = new PaperExecutor(store, { now: clock() })
    await px.openPosition(longOrder, 'e1')
    await px.closePosition('long', 'e1', 110)
    const acct = await store.getPaper()
    expect(acct.open).toBeNull()
    expect(acct.trades).toHaveLength(1)
    expect(acct.trades[0]).toMatchObject({ exit: 110, rMultiple: 2, pnl: 10, result: 'win' })
    expect(acct.balance).toBe(PAPER_START + 10)
  })

  it('closes a long LOSS at SL: -1R, -$5', async () => {
    const store = fakeStore()
    const px = new PaperExecutor(store, { now: clock() })
    await px.openPosition(longOrder, 'e1')
    await px.closePosition('long', 'e1', 95)
    const acct = await store.getPaper()
    expect(acct.trades[0]).toMatchObject({ rMultiple: -1, pnl: -5, result: 'loss' })
    expect(acct.balance).toBe(PAPER_START - 5)
  })

  it('mirrors for a short WIN (TP below entry): +2R', async () => {
    const store = fakeStore()
    const px = new PaperExecutor(store, { now: clock() })
    await px.openPosition(shortOrder, 's1')
    await px.closePosition('short', 's1', 90)
    const acct = await store.getPaper()
    expect(acct.trades[0]).toMatchObject({ direction: 'short', rMultiple: 2, pnl: 10, result: 'win' })
  })

  it('handles a reversal as close-then-open (one trade, one open)', async () => {
    const store = fakeStore()
    const px = new PaperExecutor(store, { now: clock() })
    await px.openPosition(longOrder, 'e1')
    await px.closePosition('long', 'e1-exit', 108) // reversal price
    await px.openPosition(shortOrder, 'e2')
    const acct = await store.getPaper()
    expect(acct.trades).toHaveLength(1)
    expect(acct.open).toMatchObject({ direction: 'short', eventId: 'e2' })
  })

  it('is a no-op when closing with no open position', async () => {
    const store = fakeStore()
    const px = new PaperExecutor(store, { now: clock() })
    const out = await px.closePosition('long', 'x', 100)
    expect(out.detail).toMatch(/no open position/i)
    expect((await store.getPaper()).trades).toHaveLength(0)
  })

  it('does not finalize a close without an exit price', async () => {
    const store = fakeStore()
    const px = new PaperExecutor(store, { now: clock() })
    await px.openPosition(longOrder, 'e1')
    const out = await px.closePosition('long', 'e1', undefined)
    expect(out.detail).toMatch(/no exit price/i)
    const acct = await store.getPaper()
    expect(acct.trades).toHaveLength(0)
    expect(acct.open).not.toBeNull() // still open — not lost
  })

  it('ignores a second open while one is live', async () => {
    const store = fakeStore()
    const px = new PaperExecutor(store, { now: clock() })
    await px.openPosition(longOrder, 'e1')
    const out = await px.openPosition(shortOrder, 'e2')
    expect(out.detail).toMatch(/already open/i)
    expect((await store.getPaper()).open?.eventId).toBe('e1')
  })
})
