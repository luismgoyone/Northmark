import type { Direction } from '../types.js'

export type SimConfig = { startingBalance: number; riskPct: number }

export type SimPosition = {
  id: string
  direction: Direction
  entry: number
  sl: number
  tp: number            // TP2 (the 2R target)
  riskCredits: number   // credits at risk = balance * riskPct at open
  rr: number            // reward:risk to tp (≈2) — drives win P&L
  openedAtTime: number  // candle time (epoch ms) at open
}

export type SimTrade = SimPosition & {
  exit: number
  exitReason: 'tp' | 'sl'
  result: 'win' | 'loss'
  rMultiple: number     // +rr on a win, -1 on a loss
  pnlCredits: number    // riskCredits * rMultiple
  closedAtTime: number
}

export type SimState = {
  startingBalance: number
  balance: number
  open: SimPosition | null
  armed: boolean        // may open on the next authorization? false after a close until WAIT
  trades: SimTrade[]
  nextId: number        // monotonic id source (no Date.now / Math.random)
}
