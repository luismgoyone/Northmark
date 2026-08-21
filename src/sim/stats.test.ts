import { describe, expect, it } from 'vitest'
import { simStats } from './stats'
import type { SimState, SimTrade } from './types'

const trade = (result: 'win' | 'loss', rMultiple: number, pnlCredits: number): SimTrade => ({
  id: 't', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 100, rr: 2,
  openedAtTime: 0, exit: result === 'win' ? 110 : 95, exitReason: result === 'win' ? 'tp' : 'sl',
  result, rMultiple, pnlCredits, closedAtTime: 1,
})

describe('simStats', () => {
  it('is all zeros for a fresh state', () => {
    const s: SimState = { startingBalance: 10_000, balance: 10_000, open: null, armed: true, trades: [], nextId: 1 }
    expect(simStats(s)).toEqual({ trades: 0, wins: 0, losses: 0, winRate: 0, avgR: 0, pnlCredits: 0, returnPct: 0 })
  })

  it('computes win-rate, avg R, pnl and return %', () => {
    const s: SimState = {
      startingBalance: 10_000, balance: 10_300, open: null, armed: true, nextId: 4,
      trades: [trade('win', 2, 200), trade('win', 2, 200), trade('loss', -1, -100)],
    }
    const r = simStats(s)
    expect(r).toMatchObject({ trades: 3, wins: 2, losses: 1, pnlCredits: 300 })
    expect(r.winRate).toBeCloseTo(2 / 3, 6)
    expect(r.avgR).toBeCloseTo((2 + 2 - 1) / 3, 6)
    expect(r.returnPct).toBeCloseTo(3, 6)
  })
})
