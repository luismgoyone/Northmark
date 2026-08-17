import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { Candle, MarketContext } from './types'
import type { UseMarketData } from './hooks/useMarketData'

// Mock the ONLY impure bridge so App can be tested as a pure render of hook state.
const mockUseMarketData = vi.fn<() => UseMarketData>()
vi.mock('./hooks/useMarketData', () => ({
  useMarketData: () => mockUseMarketData(),
}))

// PriceChart uses the real `lightweight-charts` canvas library, which jsdom can't
// render. Stub it the same way `src/ui/PriceChart.test.tsx` does.
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: vi.fn(), applyOptions: vi.fn() })),
    applyOptions: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn() }),
    remove: vi.fn(),
  })),
  CandlestickSeries: 'Candlestick',
  LineSeries: 'Line',
  createSeriesMarkers: vi.fn(),
}))

import App from './App'

function candle(time: number, close: number): Candle {
  return { time, open: close, high: close, low: close, close }
}
const ctx: MarketContext = {
  m5: [candle(Date.UTC(2026, 7, 14, 9, 40), 2418.8)],
  m15: [candle(Date.UTC(2026, 7, 14, 9, 30), 2418)],
  h1: [candle(Date.UTC(2026, 7, 14, 9, 0), 2417)],
}

test('loading state renders before the first ctx arrives', () => {
  mockUseMarketData.mockReturnValue({ ctx: null, loading: true, error: null })
  render(<App />)
  expect(screen.getByText(/Loading market data/i)).toBeInTheDocument()
})

test('error before any data renders an honest unavailable state, no numbers', () => {
  mockUseMarketData.mockReturnValue({
    ctx: null,
    loading: false,
    error: new Error('rate limited'),
  })
  render(<App />)
  expect(screen.getByText(/Market data unavailable/i)).toBeInTheDocument()
  expect(screen.getByText(/rate limited/)).toBeInTheDocument()
})

test('populated: WAIT band, all-monitoring vetoes, pending trade card, live-signal note', () => {
  mockUseMarketData.mockReturnValue({ ctx, loading: false, error: null })
  render(<App />)
  // Honest WAIT signal (a single candle can't pass the required-gate sequence).
  expect(screen.getByText('WAIT')).toBeInTheDocument()
  // Trade card is pending — no fabricated levels.
  expect(screen.getByText('Awaiting setup')).toBeInTheDocument()
  // Vetoes read calm.
  expect(screen.getByText(/0 active/)).toBeInTheDocument()
  // The live-signal-assembly note is visible.
  expect(screen.getByText(/Live signal assembly is active/)).toBeInTheDocument()
  // The read-only disclaimer footer survives.
  expect(screen.getByText(/never places orders/i)).toBeInTheDocument()
})

test('interactive controls are read-only (theme + chart timeframe) — no buy/order/execute', () => {
  mockUseMarketData.mockReturnValue({ ctx, loading: false, error: null })
  render(<App />)
  expect(
    screen.queryByRole('button', { name: /buy|order|execute|place/i }),
  ).not.toBeInTheDocument()
  const buttons = screen.getAllByRole('button')
  // Theme toggle + the chart's M5/M15/H1 timeframe toggle — all read-only.
  expect(buttons).toHaveLength(4)
  expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'M5' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'M15' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'H1' })).toBeInTheDocument()
})

it('renders the price chart with a timeframe toggle when data is loaded', () => {
  mockUseMarketData.mockReturnValue({ ctx, loading: false, error: null })
  render(<App />)
  expect(screen.getByRole('button', { name: 'M5' })).toBeInTheDocument()
})
