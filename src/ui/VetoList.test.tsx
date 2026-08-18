import { render, screen, within } from '@testing-library/react'
import type { GateResult } from '../types'
import { VetoList } from './VetoList'

const deferred: GateResult[] = [
  { id: 'news-filter', status: 'wait', detail: 'Needs live broker/session data (not available locally).' },
  {
    id: 'price-extended',
    status: 'wait',
    detail: 'Not independently wired yet — the required-gate checklist covers the current setup state.',
  },
]

test('all-monitoring reads calm: 0 active, 0 clear, 2 monitoring in words', () => {
  render(<VetoList vetoes={deferred} />)
  expect(screen.getByText(/0 active · 0 clear · 2 monitoring/)).toBeInTheDocument()
  // Every monitoring row shows the calm Monitoring chip.
  expect(screen.getAllByText('Monitoring').length).toBeGreaterThanOrEqual(2)
  // No triggered No-Trade chip on any veto ROW when none are triggered.
  expect(screen.queryByText('No-Trade')).not.toBeInTheDocument()
})

test('resolves friendly veto names from the engine catalogue', () => {
  render(<VetoList vetoes={deferred} />)
  expect(screen.getByText('Major news filter prohibits trading')).toBeInTheDocument()
  expect(screen.getByText('Price is excessively extended')).toBeInTheDocument()
})

test('a triggered veto shows a loud No-Trade chip and its real detail', () => {
  const triggered: GateResult[] = [
    { id: 'rr-insufficient', status: 'fail', detail: 'Risk/reward is insufficient is the active no-trade condition.' },
    ...deferred,
  ]
  render(<VetoList vetoes={triggered} />)
  expect(screen.getByText(/1 active · 0 clear · 2 monitoring/)).toBeInTheDocument()
  const row = screen.getByText('Risk/reward is insufficient').closest('.grid')
  expect(row).not.toBeNull()
  expect(within(row as HTMLElement).getByText('No-Trade')).toBeInTheDocument()
  expect(
    screen.getByText('Risk/reward is insufficient is the active no-trade condition.'),
  ).toBeInTheDocument()
})

test('a cleared veto shows the green Pass chip and its real detail', () => {
  const cleared: GateResult[] = [
    { id: 'h1-bias-unclear', status: 'pass', detail: 'Cleared: h1-m15-bias passed.' },
    ...deferred,
  ]
  render(<VetoList vetoes={cleared} />)
  expect(screen.getByText(/0 active · 1 clear · 2 monitoring/)).toBeInTheDocument()
  const row = screen.getByText('H1 direction is unclear').closest('.grid')
  expect(row).not.toBeNull()
  expect(within(row as HTMLElement).getByText('Pass')).toBeInTheDocument()
  expect(screen.getByText('Cleared: h1-m15-bias passed.')).toBeInTheDocument()
})

test('a monitoring veto shows its real detail, not a hardcoded placeholder', () => {
  render(<VetoList vetoes={deferred} />)
  expect(
    screen.getByText('Needs live broker/session data (not available locally).'),
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      'Not independently wired yet — the required-gate checklist covers the current setup state.',
    ),
  ).toBeInTheDocument()
  expect(screen.queryByText('Not yet evaluable — Phase 1')).not.toBeInTheDocument()
})

test('a mix of all three states renders every kind with a correct 3-way header count', () => {
  const mixed: GateResult[] = [
    { id: 'rr-insufficient', status: 'fail', detail: 'Risk/reward is insufficient is the active no-trade condition.' },
    { id: 'h1-bias-unclear', status: 'pass', detail: 'Cleared: h1-m15-bias passed.' },
    { id: 'news-filter', status: 'wait', detail: 'Needs live broker/session data (not available locally).' },
  ]
  render(<VetoList vetoes={mixed} />)
  expect(screen.getByText(/1 active · 1 clear · 1 monitoring/)).toBeInTheDocument()
  expect(screen.getByText('No-Trade')).toBeInTheDocument()
  expect(screen.getByText('Pass')).toBeInTheDocument()
  expect(screen.getByText('Monitoring')).toBeInTheDocument()
})

test('renders no interactive buy/order/execute affordance', () => {
  render(<VetoList vetoes={deferred} />)
  expect(
    screen.queryByRole('button', { name: /buy|order|execute|place/i }),
  ).not.toBeInTheDocument()
})
