// executor/orderParams.test.ts
import { describe, expect, it } from 'vitest'
import { buildMarketOrder, sanitizeClientId } from './orderParams'
import type { BrokerOrder } from './types'

const long: BrokerOrder = { symbol: 'XAUUSDm', direction: 'long', entry: 100, sl: 99, tp: 101.2, lot: 0.01 }

describe('buildMarketOrder', () => {
  it('maps a long → market buy with sl/tp/volume and a sanitized clientId', () => {
    expect(buildMarketOrder(long, '2026-08-29T00:00:00Z-XAUUSD-buy')).toEqual({
      side: 'buy', symbol: 'XAUUSDm', volume: 0.01, stopLoss: 99, takeProfit: 101.2,
      clientId: sanitizeClientId('2026-08-29T00:00:00Z-XAUUSD-buy'),
    })
  })
  it('maps a short → market sell', () => {
    expect(buildMarketOrder({ ...long, direction: 'short', sl: 101, tp: 98.8 }, 'e').side).toBe('sell')
  })
})
describe('sanitizeClientId', () => {
  it('keeps only [A-Za-z0-9_] and caps length at 25', () => {
    const c = sanitizeClientId('2026-08-29T00:00:00Z-XAUUSD-buy:extra!!')
    expect(c).toMatch(/^[A-Za-z0-9_]+$/)
    expect(c.length).toBeLessThanOrEqual(25)
  })
})
