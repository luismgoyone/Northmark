// executor/paper.ts
import type { BrokerOrder, PaperAccount, PaperTrade } from './types.js'
import type { Executor, ExecOutcome, Store } from './ports.js'

/** Nominal starting balance — only drives the return-% display; the real figures are win-rate/R/$P&L. */
export const PAPER_START = 100
/** XAUUSD contract size: 1 lot = 100 oz → $1 per $1 price move at 0.01 lot (matches the broker). */
export const CONTRACT_SIZE = 100

export function emptyAccount(startingBalance = PAPER_START): PaperAccount {
  return { startingBalance, balance: startingBalance, open: null, trades: [] }
}

/**
 * Paper-execution mode: records the mirrored V2.7.1 signals as paper trades instead of placing
 * broker orders. Rides the same pipeline (dedupe + FLAT/LONG/SHORT state machine), so exactly one
 * position is open at a time and reversals arrive as [EXIT, ENTRY]. Free — no broker, no cost.
 */
export class PaperExecutor implements Executor {
  private readonly contractSize: number
  private readonly now: () => number
  constructor(private readonly store: Store, opts: { contractSize?: number; now?: () => number } = {}) {
    this.contractSize = opts.contractSize ?? CONTRACT_SIZE
    this.now = opts.now ?? ((): number => Date.now())
  }

  async openPosition(order: BrokerOrder, eventId: string): Promise<ExecOutcome> {
    const acct = await this.store.getPaper()
    if (acct.open) return { status: 'paper', detail: `paper: a position is already open — ignored ${eventId}` }
    const risk = Math.abs(order.entry - order.sl) * this.contractSize * order.lot
    acct.open = {
      eventId, direction: order.direction, entry: order.entry, sl: order.sl, tp: order.tp,
      lot: order.lot, risk, openedAt: this.now(),
    }
    await this.store.setPaper(acct)
    return { status: 'paper', detail: `paper: opened ${order.direction} @${order.entry} SL${order.sl} TP${order.tp}` }
  }

  async closePosition(direction: 'long' | 'short', eventId: string, exitPrice?: number): Promise<ExecOutcome> {
    const acct = await this.store.getPaper()
    const open = acct.open
    if (!open) return { status: 'paper', detail: `paper: no open position to close (${eventId})` }
    if (exitPrice === undefined || !Number.isFinite(exitPrice)) {
      return { status: 'paper', detail: `paper: no exit price — cannot finalize (${eventId})` }
    }
    const dir = open.direction === 'long' ? 1 : -1
    const riskDist = Math.abs(open.entry - open.sl)
    const rMultiple = riskDist > 0 ? ((exitPrice - open.entry) * dir) / riskDist : 0
    const pnl = (exitPrice - open.entry) * dir * this.contractSize * open.lot
    const trade: PaperTrade = {
      ...open, exit: exitPrice, closedAt: this.now(), rMultiple, pnl, result: pnl >= 0 ? 'win' : 'loss',
    }
    acct.trades.push(trade)
    acct.balance += pnl
    acct.open = null
    await this.store.setPaper(acct)
    return { status: 'paper', detail: `paper: closed ${direction} @${exitPrice} (${rMultiple.toFixed(2)}R, $${pnl.toFixed(2)})` }
  }
}
