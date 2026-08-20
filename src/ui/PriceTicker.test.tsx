import { render, screen } from '@testing-library/react'
import type { Candle, MarketContext } from '../types'
import { PriceTicker } from './PriceTicker'

const c = (time: number, open: number, close: number): Candle => ({
  time,
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
})
const ctxWith = (m5: Candle[]): MarketContext => ({ m5, m15: m5, h1: m5 })
const STEP = 5 * 60_000

test('renders the latest price big and the up change since the day open', () => {
  const day = Date.UTC(2026, 7, 20)
  render(<PriceTicker ctx={ctxWith([c(day, 2400, 2402), c(day + STEP, 2402, 2410)])} />)
  expect(screen.getByText('2,410.00')).toBeInTheDocument()
  // change = 2410 − 2400 = 10 → +0.42%
  expect(screen.getByText(/10\.00 \(\+0\.42%\)/)).toBeInTheDocument()
})

test('renders a down change with a minus sign', () => {
  const day = Date.UTC(2026, 7, 20)
  render(<PriceTicker ctx={ctxWith([c(day, 2500, 2500), c(day + STEP, 2500, 2480)])} />)
  expect(screen.getByText('2,480.00')).toBeInTheDocument()
  expect(screen.getByText(/20\.00 \(−0\.80%\)/)).toBeInTheDocument()
})

test('renders nothing when there is no data', () => {
  const { container } = render(<PriceTicker ctx={ctxWith([])} />)
  expect(container).toBeEmptyDOMElement()
})

test('renders no interactive buy/order/execute affordance', () => {
  const day = Date.UTC(2026, 7, 20)
  render(<PriceTicker ctx={ctxWith([c(day, 2400, 2410)])} />)
  expect(screen.queryByRole('button', { name: /buy|order|execute|place/i })).not.toBeInTheDocument()
})
