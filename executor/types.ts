// executor/types.ts
export type Action = 'buy' | 'sell'
export type MarketPosition = 'long' | 'short' | 'flat'
export type Signal = {
  secret?: string
  eventId: string
  timestamp: string
  symbol: string
  action: Action | null
  marketPosition: MarketPosition
  prevMarketPosition: MarketPosition
  entry?: number
  sl?: number
  tp?: number
  lot?: number
  setupStrength?: string
}
export type SignalEventType = 'LONG_ENTRY' | 'SHORT_ENTRY' | 'LONG_EXIT' | 'SHORT_EXIT'
export type SignalEvent = { type: SignalEventType; direction: 'long' | 'short'; isEntry: boolean }
export type PositionState = 'FLAT' | 'LONG' | 'SHORT'
export type BrokerOrder = { symbol: string; direction: 'long' | 'short'; entry: number; sl: number; tp: number; lot: number }
