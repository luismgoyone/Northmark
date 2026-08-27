import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GradeAnalytics } from './GradeAnalytics'
import type { SimState, SimTrade } from '../../sim/types'

const win = (grade: 'A' | 'B'): SimTrade => ({
  id: 't', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2,
  openedAtTime: 0, grade, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 4, closedAtTime: 1,
})
const state = (trades: SimTrade[]): SimState => ({ startingBalance: 200, balance: 200, open: null, armed: true, nextId: 1, trades })

describe('GradeAnalytics', () => {
  it('renders a row per graded bucket with its win rate', () => {
    render(<GradeAnalytics state={state([win('A'), win('B')])} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getAllByText(/100%/).length).toBeGreaterThan(0)
  })
  it('shows an empty hint with no graded trades', () => {
    render(<GradeAnalytics state={state([])} />)
    expect(screen.getByText(/no graded trades yet/i)).toBeInTheDocument()
  })
})
