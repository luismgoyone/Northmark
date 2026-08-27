import { describe, expect, it } from 'vitest'
import { gradeStats } from './gradeStats'
import type { SimState, SimTrade } from './types'

const trade = (grade: 'A' | 'B', result: 'win' | 'loss'): SimTrade => ({
  id: 't', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2,
  openedAtTime: 0, grade, exit: result === 'win' ? 110 : 95, exitReason: result === 'win' ? 'tp' : 'sl',
  result, rMultiple: result === 'win' ? 2 : -1, pnlCredits: result === 'win' ? 4 : -2, closedAtTime: 1,
})

const state = (trades: SimTrade[]): SimState => ({
  startingBalance: 200, balance: 200, open: null, armed: true, nextId: 1, trades,
})

describe('gradeStats', () => {
  it('groups trades by grade with per-grade win rate and avg R, ordered A→F', () => {
    const rows = gradeStats(state([trade('A', 'win'), trade('A', 'loss'), trade('B', 'win')]))
    expect(rows.map((r) => r.grade)).toEqual(['A', 'B'])
    const a = rows[0]!
    expect(a.trades).toBe(2)
    expect(a.wins).toBe(1)
    expect(a.winRate).toBeCloseTo(0.5, 6)
    expect(a.avgR).toBeCloseTo(0.5, 6) // (2 + -1) / 2
    expect(a.pnlCredits).toBe(2) // 4 + (-2)
    expect(rows[1]!.grade).toBe('B')
  })

  it('returns [] when there are no graded trades', () => {
    expect(gradeStats(state([]))).toEqual([])
  })
})
