import type { SimState } from './types.js'

export type SimStats = {
  trades: number
  wins: number
  losses: number
  winRate: number      // wins / trades, 0 when no trades
  avgR: number         // mean rMultiple, 0 when no trades
  pnlCredits: number   // balance − startingBalance
  returnPct: number    // pnlCredits / startingBalance * 100
}

export function simStats(state: SimState): SimStats {
  const trades = state.trades.length
  const wins = state.trades.filter((t) => t.result === 'win').length
  const losses = trades - wins
  const winRate = trades > 0 ? wins / trades : 0
  const avgR = trades > 0 ? state.trades.reduce((sum, t) => sum + t.rMultiple, 0) / trades : 0
  const pnlCredits = state.balance - state.startingBalance
  const returnPct = state.startingBalance > 0 ? (pnlCredits / state.startingBalance) * 100 : 0
  return { trades, wins, losses, winRate, avgR, pnlCredits, returnPct }
}
