import { render, screen, within } from '@testing-library/react'
import type { GateResult } from '../types'
import { VetoList } from './VetoList'

const deferred: GateResult[] = [
  { id: 'news-filter', status: 'wait', detail: 'deferred: phase-3 — needs data.' },
  { id: 'price-extended', status: 'wait', detail: 'deferred: phase-2 — needs a gate.' },
]

test('all-deferred reads calm: 0 active and monitoring count in words', () => {
  render(<VetoList vetoes={deferred} />)
  expect(screen.getByText(/0 active · 2 monitoring/)).toBeInTheDocument()
  // Every deferred row shows the calm Monitoring chip.
  expect(screen.getAllByText('Monitoring').length).toBeGreaterThanOrEqual(2)
  // No triggered No-Trade chip on any veto ROW when all are deferred.
  expect(screen.queryByText('No-Trade')).not.toBeInTheDocument()
})

test('resolves friendly veto names from the engine catalogue', () => {
  render(<VetoList vetoes={deferred} />)
  expect(screen.getByText('Major news filter prohibits trading')).toBeInTheDocument()
  expect(screen.getByText('Price is excessively extended')).toBeInTheDocument()
})

test('a triggered veto shows a loud No-Trade chip and its detail', () => {
  const triggered: GateResult[] = [
    { id: 'rr-insufficient', status: 'fail', detail: 'R:R 1.2 below 1.5 minimum.' },
    ...deferred,
  ]
  render(<VetoList vetoes={triggered} />)
  expect(screen.getByText(/1 active · 2 monitoring/)).toBeInTheDocument()
  const row = screen.getByText('Risk/reward is insufficient').closest('.grid')
  expect(row).not.toBeNull()
  expect(within(row as HTMLElement).getByText('No-Trade')).toBeInTheDocument()
  expect(screen.getByText('R:R 1.2 below 1.5 minimum.')).toBeInTheDocument()
})

test('renders no interactive buy/order/execute affordance', () => {
  render(<VetoList vetoes={deferred} />)
  expect(
    screen.queryByRole('button', { name: /buy|order|execute|place/i }),
  ).not.toBeInTheDocument()
})
