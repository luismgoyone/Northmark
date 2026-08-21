import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { SimPanel } from './SimPanel'
import { simStats } from '../sim/stats'
import type { SimState } from '../sim/types'

const empty: SimState = { startingBalance: 10_000, balance: 10_000, open: null, armed: true, trades: [], nextId: 1 }

const win = (id: string): SimState['trades'][number] => ({
  id, direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 100, rr: 2,
  openedAtTime: 0, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 200, closedAtTime: 1,
})
const loss = (id: string): SimState['trades'][number] => ({
  id, direction: 'short', entry: 100, sl: 105, tp: 90, riskCredits: 100, rr: 2,
  openedAtTime: 0, exit: 105, exitReason: 'sl', result: 'loss', rMultiple: -1, pnlCredits: -100, closedAtTime: 1,
})

test('renders the PAPER label and an empty state before any trades', () => {
  render(<SimPanel state={empty} stats={simStats(empty)} onReset={vi.fn()} />)
  expect(screen.getByText(/credits, not real money/i)).toBeInTheDocument()
  expect(screen.getByText(/No paper trades yet/i)).toBeInTheDocument()
})

test('renders balance, win-rate and record once there are trades', () => {
  const state: SimState = { startingBalance: 10_000, balance: 10_300, open: null, armed: true, nextId: 4, trades: [win('t1'), win('t2'), loss('t3')] }
  render(<SimPanel state={state} stats={simStats(state)} onReset={vi.fn()} />)
  expect(screen.getByText('10,300')).toBeInTheDocument()
  expect(screen.getByText('67%')).toBeInTheDocument()
  expect(screen.getByText('2-1')).toBeInTheDocument()
})

test('calls onReset when Reset is clicked', () => {
  const onReset = vi.fn()
  render(<SimPanel state={empty} stats={simStats(empty)} onReset={onReset} />)
  fireEvent.click(screen.getByText('Reset'))
  expect(onReset).toHaveBeenCalled()
})

test('renders no buy/order/execute affordance', () => {
  render(<SimPanel state={empty} stats={simStats(empty)} onReset={vi.fn()} />)
  expect(screen.queryByRole('button', { name: /buy|order|execute|place/i })).not.toBeInTheDocument()
})

test('recent trade rows carry a text label for result, not color/icon alone', () => {
  const state: SimState = { startingBalance: 10_000, balance: 10_100, open: null, armed: true, nextId: 3, trades: [win('t1'), loss('t2')] }
  render(<SimPanel state={state} stats={simStats(state)} onReset={vi.fn()} />)
  expect(screen.getByText('win')).toBeInTheDocument()
  expect(screen.getByText('loss')).toBeInTheDocument()
})
