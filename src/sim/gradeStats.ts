import type { SimState } from './types.js'
import type { Grade } from '../edge/scoreSetup.js'

export type GradeStatRow = {
  grade: Grade
  trades: number
  wins: number
  winRate: number
  avgR: number
  pnlCredits: number
}

const ORDER: Grade[] = ['A', 'B', 'C', 'D', 'F']

/** Per-grade record for the Claude account's closed trades. One row per grade present, A→F. */
export function gradeStats(state: SimState): GradeStatRow[] {
  const rows: GradeStatRow[] = []
  for (const grade of ORDER) {
    const ts = state.trades.filter((t) => t.grade === grade)
    if (ts.length === 0) continue
    const wins = ts.filter((t) => t.result === 'win').length
    const rSum = ts.reduce((a, t) => a + t.rMultiple, 0)
    const pnl = ts.reduce((a, t) => a + t.pnlCredits, 0)
    rows.push({
      grade,
      trades: ts.length,
      wins,
      winRate: wins / ts.length,
      avgR: rSum / ts.length,
      pnlCredits: pnl,
    })
  }
  return rows
}
