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

// ── Paper record (paper-execution mode): a free ledger of the mirrored V2.7.1 trades. ──
export type PaperOpen = {
  eventId: string
  direction: 'long' | 'short'
  entry: number
  sl: number
  tp: number
  lot: number
  risk: number       // dollar risk at the paper lot = |entry-sl| * contractSize * lot
  openedAt: number   // epoch ms when the entry signal was executed on paper
}
export type PaperTrade = PaperOpen & {
  exit: number
  closedAt: number
  rMultiple: number  // (exit-entry)*dir / |entry-sl|
  pnl: number        // dollar P&L at the paper lot = risk * rMultiple
  result: 'win' | 'loss'
}
export type PaperAccount = {
  startingBalance: number
  balance: number
  open: PaperOpen | null
  trades: PaperTrade[]
}
