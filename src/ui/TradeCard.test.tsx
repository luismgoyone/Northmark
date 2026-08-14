import { render, screen } from '@testing-library/react'
import { TradeCard, type TradeSetup } from './TradeCard'

const setup: TradeSetup = {
  direction: 'long',
  entry: 2418.8,
  sl: 2415.9,
  tp1: 2422.6,
  tp2: 2425.3,
  lot: 0.01,
  riskDollars: 2,
  riskPct: 0.01,
  rr1: 1.3,
  rr2: 2.2,
  minRR: 1.5,
}

test('pending state shows an honest empty state, never fabricated numbers', () => {
  render(<TradeCard setup={null} />)
  expect(screen.getByText('Awaiting setup')).toBeInTheDocument()
  expect(screen.getByText(/Phase 2/)).toBeInTheDocument()
  // No price-shaped values in the pending state.
  expect(screen.queryByText(/2,4\d\d\.\d\d/)).not.toBeInTheDocument()
})

test('populated state renders every real level and the lot/risk fields', () => {
  render(<TradeCard setup={setup} />)
  expect(screen.getAllByText('2,418.80').length).toBeGreaterThanOrEqual(1) // entry (ladder + grid)
  expect(screen.getAllByText('2,415.90').length).toBeGreaterThanOrEqual(1) // SL
  expect(screen.getAllByText('2,422.60').length).toBeGreaterThanOrEqual(1) // TP1
  expect(screen.getAllByText('2,425.30').length).toBeGreaterThanOrEqual(1) // TP2
  expect(screen.getByText('0.01')).toBeInTheDocument() // lot
  expect(screen.getByText('$2.00')).toBeInTheDocument() // risk $
})

test('R:R below minimum marks the card Provisional and flags the R:R field', () => {
  render(<TradeCard setup={setup} />)
  expect(screen.getByText(/Provisional levels/)).toBeInTheDocument()
  expect(screen.getByText(/below 1.5 minimum/)).toBeInTheDocument()
})

test('a healthy R:R renders neither the provisional badge nor the flag', () => {
  render(<TradeCard setup={{ ...setup, rr1: 2, rr2: 3 }} />)
  expect(screen.queryByText(/Provisional levels/)).not.toBeInTheDocument()
  expect(screen.queryByText(/below 1.5 minimum/)).not.toBeInTheDocument()
})

test('the R:R ladder exposes all four levels to assistive tech', () => {
  render(<TradeCard setup={setup} />)
  expect(
    screen.getByLabelText(
      /stop 2,415.90, entry 2,418.80, TP1 2,422.60, TP2 2,425.30/,
    ),
  ).toBeInTheDocument()
})

test('renders no interactive buy/order/execute affordance in either state', () => {
  const { rerender } = render(<TradeCard setup={null} />)
  expect(
    screen.queryByRole('button', { name: /buy|order|execute|place/i }),
  ).not.toBeInTheDocument()
  rerender(<TradeCard setup={setup} />)
  expect(
    screen.queryByRole('button', { name: /buy|order|execute|place/i }),
  ).not.toBeInTheDocument()
})
