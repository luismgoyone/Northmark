import { describe, expect, it } from 'vitest'
import { paperToSimState } from './fromPaper'
import { simStats } from './stats'
import type { PaperAccount } from '../../executor/types'

const winTrade = {
  eventId: 't1', direction: 'long' as const, entry: 100, sl: 95, tp: 110, lot: 0.01, risk: 5,
  openedAt: 1000, exit: 110, closedAt: 2000, rMultiple: 2, pnl: 10, result: 'win' as const,
}

describe('paperToSimState', () => {
  it('maps an empty account to a flat, zeroed SimState', () => {
    const acct: PaperAccount = { startingBalance: 100, balance: 100, open: null, trades: [] }
    const s = paperToSimState(acct)
    expect(s).toMatchObject({ startingBalance: 100, balance: 100, open: null, armed: true, trades: [], nextId: 1 })
    expect(simStats(s)).toMatchObject({ trades: 0, winRate: 0, pnlCredits: 0 })
  })

  it('maps a closed trade (risk→riskCredits, pnl→pnlCredits, rr, times) and drives stats', () => {
    const acct: PaperAccount = { startingBalance: 100, balance: 110, open: null, trades: [winTrade] }
    const s = paperToSimState(acct)
    expect(s.nextId).toBe(2)
    expect(s.trades[0]).toMatchObject({
      id: 't1', direction: 'long', entry: 100, sl: 95, tp: 110, lot: 0.01,
      riskCredits: 5, rr: 2, exit: 110, exitReason: 'tp', result: 'win',
      rMultiple: 2, pnlCredits: 10, openedAtTime: 1000, closedAtTime: 2000,
    })
    const st = simStats(s)
    expect(st).toMatchObject({ trades: 1, wins: 1, losses: 0, pnlCredits: 10 })
    expect(st.winRate).toBe(1)
  })

  it('maps an open position with a computed rr', () => {
    const acct: PaperAccount = {
      startingBalance: 100, balance: 100,
      open: { eventId: 'o1', direction: 'short', entry: 100, sl: 105, tp: 90, lot: 0.01, risk: 5, openedAt: 500 },
      trades: [],
    }
    const s = paperToSimState(acct)
    expect(s.open).toMatchObject({ id: 'o1', direction: 'short', riskCredits: 5, rr: 2, openedAtTime: 500 })
  })
})
