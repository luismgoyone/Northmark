import type { PaperAccount, PaperOpen, PaperTrade } from '../../executor/types.js'
import type { SimPosition, SimState, SimTrade } from './types'

// Maps the executor's paper ledger into the app's SimState shape so the existing SimPanel +
// simStats render it exactly like the other paper panels. Pure — no side effects.

function rrOf(entry: number, sl: number, tp: number): number {
  const risk = Math.abs(entry - sl)
  return risk > 0 ? Math.abs(tp - entry) / risk : 0
}

function openToPosition(o: PaperOpen): SimPosition {
  return {
    id: o.eventId, direction: o.direction, entry: o.entry, sl: o.sl, tp: o.tp,
    riskCredits: o.risk, lot: o.lot, rr: rrOf(o.entry, o.sl, o.tp), openedAtTime: o.openedAt,
  }
}

function tradeToSim(t: PaperTrade): SimTrade {
  return {
    ...openToPosition(t),
    exit: t.exit,
    // exitReason is approximate: a paper close prices at the bar close, so we label by outcome sign.
    exitReason: t.rMultiple >= 0 ? 'tp' : 'sl',
    result: t.result,
    rMultiple: t.rMultiple,
    pnlCredits: t.pnl,
    closedAtTime: t.closedAt,
  }
}

export function paperToSimState(acct: PaperAccount): SimState {
  return {
    startingBalance: acct.startingBalance,
    balance: acct.balance,
    open: acct.open ? openToPosition(acct.open) : null,
    armed: true,
    trades: acct.trades.map(tradeToSim),
    nextId: acct.trades.length + 1,
  }
}
