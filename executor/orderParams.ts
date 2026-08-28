// executor/orderParams.ts
import type { BrokerOrder } from './types.js'

export type MarketOrderReq = { side: 'buy' | 'sell'; symbol: string; volume: number; stopLoss: number; takeProfit: number; clientId: string }

/** MetaApi clientId must be [A-Za-z0-9_] and short. Replace others with '_' and cap at 25. */
export function sanitizeClientId(eventId: string): string {
  return eventId.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 25)
}

export function buildMarketOrder(order: BrokerOrder, eventId: string): MarketOrderReq {
  return {
    side: order.direction === 'long' ? 'buy' : 'sell',
    symbol: order.symbol,
    volume: order.lot,
    stopLoss: order.sl,
    takeProfit: order.tp,
    clientId: sanitizeClientId(eventId),
  }
}
