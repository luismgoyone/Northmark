import { render, screen, within } from '@testing-library/react'
import type { GateResult } from '../types'
import { Checklist } from './Checklist'

const gates: GateResult[] = [
  { id: 'h1-m15-bias', status: 'pass', detail: 'Both timeframes bullish' },
  { id: 'retest', status: 'wait', detail: 'Awaiting pullback' },
  { id: 'risk-reward', status: 'fail', detail: 'R:R 1.3 below 1.5 minimum' },
]

test('renders one numbered row per gate with its friendly name and detail, under its layer', () => {
  render(<Checklist gates={gates} />)
  expect(screen.getByText('H1 bias / direction')).toBeInTheDocument()
  expect(screen.getByText('Reward : Risk ≥ 1.5')).toBeInTheDocument()
  expect(screen.getByText('Both timeframes bullish')).toBeInTheDocument()
  // Continuous numbering across the layer groups.
  expect(screen.getByText('01')).toBeInTheDocument()
  expect(screen.getByText('03')).toBeInTheDocument()
  // Layer headers present.
  expect(screen.getByText('Market Filter')).toBeInTheDocument()
  expect(screen.getByText('Trigger')).toBeInTheDocument()
})

test('every status carries a text label, never color alone', () => {
  render(<Checklist gates={gates} />)
  expect(screen.getByText('Pass')).toBeInTheDocument()
  expect(screen.getByText('Wait')).toBeInTheDocument()
  expect(screen.getByText('Fail')).toBeInTheDocument()
})

test('a fail row is present and distinct from wait/pass', () => {
  render(<Checklist gates={gates} />)
  const failRow = screen.getByText('Reward : Risk ≥ 1.5').closest('.grid')
  expect(failRow).not.toBeNull()
  expect(within(failRow as HTMLElement).getByText('Fail')).toBeInTheDocument()
})

test('renders no interactive buy/order/execute affordance', () => {
  render(<Checklist gates={gates} />)
  expect(
    screen.queryByRole('button', { name: /buy|order|execute|place/i }),
  ).not.toBeInTheDocument()
})
