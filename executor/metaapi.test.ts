// executor/metaapi.test.ts
import { describe, expect, it } from 'vitest'
import { executeWith } from './metaapi'  // pure helper that takes a connection-like object

const fakeConn = {
  calls: [] as string[],
  async createMarketBuyOrder(sym: string, vol: number, sl: number, tp: number) { this.calls.push(`buy ${sym} ${vol} ${sl} ${tp}`); return { orderId: '111', stringCode: 'TRADE_RETCODE_DONE' } },
  async createMarketSellOrder(sym: string, vol: number, sl: number, tp: number) { this.calls.push(`sell ${sym} ${vol} ${sl} ${tp}`); return { orderId: '222', stringCode: 'TRADE_RETCODE_DONE' } },
  async closePositionsBySymbol(sym: string) { this.calls.push(`close ${sym}`); return { orderId: '333', stringCode: 'TRADE_RETCODE_DONE' } },
}

describe('executeWith', () => {
  it('opens a long via createMarketBuyOrder and returns sent+ticket', async () => {
    const c = { ...fakeConn, calls: [] as string[] }
    const r = await executeWith(c, { kind: 'open', order: { symbol: 'XAUUSDm', direction: 'long', entry: 100, sl: 99, tp: 101, lot: 0.01 }, eventId: 'e' })
    expect(r.status).toBe('sent'); expect(r.ticket).toBe('111')
    expect(c.calls[0]).toMatch(/^buy XAUUSDm 0.01 99 101/)
  })
  it('closes via closePositionsBySymbol', async () => {
    const c = { ...fakeConn, calls: [] as string[] }
    const r = await executeWith(c, { kind: 'close', symbol: 'XAUUSDm', direction: 'long', eventId: 'e' })
    expect(r.status).toBe('sent'); expect(c.calls[0]).toBe('close XAUUSDm')
  })
  it('maps a thrown broker error to status error (never throws)', async () => {
    const c = { async createMarketBuyOrder() { throw new Error('TRADE_RETCODE_REJECT') } }
    const r = await executeWith(c as never, { kind: 'open', order: { symbol: 'XAUUSDm', direction: 'long', entry: 100, sl: 99, tp: 101, lot: 0.01 }, eventId: 'e' })
    expect(r.status).toBe('error'); expect(r.detail).toMatch(/REJECT/)
  })
})
