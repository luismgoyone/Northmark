// src/ui/SimPanel.test.tsx
import { render, screen } from '@testing-library/react'
import { SimPanel } from './SimPanel'
import { fmtPhtDateTime } from './format'
import { simStats } from '../sim/stats'
import type { SimState } from '../sim/types'
import type { SimMeta } from '../hooks/useServerSim'

const NO_META: SimMeta = { limitReachedAt: null, updatedAt: null }
const empty: SimState = { startingBalance: 10_000, balance: 10_000, open: null, armed: true, trades: [], nextId: 1 }

const winTrade = {
  id: 't1', direction: 'long' as const, entry: 4473.37, sl: 4478.48, tp: 4463.14, riskCredits: 100, lot: 0.2, rr: 2,
  openedAtTime: Date.UTC(2026, 7, 23, 13, 30), exit: 4463.14, exitReason: 'tp' as const,
  result: 'win' as const, rMultiple: 2, pnlCredits: 200, closedAtTime: Date.UTC(2026, 7, 23, 13, 50),
}

test('formats a closed time in Philippine time', () => {
  // 13:50 UTC → 21:50 PHT
  expect(fmtPhtDateTime(Date.UTC(2026, 7, 23, 13, 50))).toMatch(/23 Aug.*9:50/)
})

test('empty state + no reset button', () => {
  render(<SimPanel state={empty} stats={simStats(empty)} meta={NO_META} />)
  expect(screen.getByText(/USD, not real money/i)).toBeInTheDocument()
  expect(screen.getByText(/No paper trades yet/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
})

test('a trade row shows entry, target, exit, R, USD P&L, lot, risk $, and a PHT date-time', () => {
  const state: SimState = { ...empty, balance: 204, trades: [winTrade] }
  render(<SimPanel state={state} stats={simStats(state)} meta={NO_META} />)
  expect(screen.getByText(/4,473.37/)).toBeInTheDocument() // entry
  expect(screen.getByText(/4,463.14/)).toBeInTheDocument() // target/exit
  expect(screen.getByText(/\+\$200.00/)).toBeInTheDocument() // USD P&L
  expect(screen.getByText(/lot 0.20 · risk \$100.00/)).toBeInTheDocument() // lot + amount risked
  expect(screen.getByText(/23 Aug/)).toBeInTheDocument()
  expect(screen.getByText('win')).toBeInTheDocument() // sr-only status label
})

test('shows the data-limit note when the limit is newer than the last update', () => {
  const meta: SimMeta = { limitReachedAt: Date.UTC(2026, 7, 23, 13, 50), updatedAt: Date.UTC(2026, 7, 23, 12, 0) }
  render(<SimPanel state={empty} stats={simStats(empty)} meta={meta} />)
  expect(screen.getByText(/Data limit reached/i)).toBeInTheDocument()
})

test('hides the data-limit note once an update is newer', () => {
  const meta: SimMeta = { limitReachedAt: Date.UTC(2026, 7, 23, 12, 0), updatedAt: Date.UTC(2026, 7, 23, 13, 0) }
  render(<SimPanel state={empty} stats={simStats(empty)} meta={meta} />)
  expect(screen.queryByText(/Data limit reached/i)).not.toBeInTheDocument()
})
