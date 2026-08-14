import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { Candle, MarketContext } from './types'
import type { UseMarketData } from './hooks/useMarketData'

// Mock the ONLY impure bridge so App can be tested as a pure render of hook state.
const mockUseMarketData = vi.fn<() => UseMarketData>()
vi.mock('./hooks/useMarketData', () => ({
  useMarketData: () => mockUseMarketData(),
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

test('populated: WAIT band, all-monitoring vetoes, pending trade card, Phase-2 note', () => {
  mockUseMarketData.mockReturnValue({ ctx, loading: false, error: null })
  render(<App />)
  // Honest WAIT signal (no gate can pass in Phase 1).
  expect(screen.getByText('WAIT')).toBeInTheDocument()
  // Trade card is pending — no fabricated levels.
  expect(screen.getByText('Awaiting setup')).toBeInTheDocument()
  // Vetoes read calm.
  expect(screen.getByText(/0 active/)).toBeInTheDocument()
  // The Phase-2 honesty note is visible.
  expect(screen.getByText(/Phase 1 of 2/)).toBeInTheDocument()
  // The read-only disclaimer footer survives.
  expect(screen.getByText(/never places orders/i)).toBeInTheDocument()
})

test('the only interactive control is the theme toggle — no buy/order/execute', () => {
  mockUseMarketData.mockReturnValue({ ctx, loading: false, error: null })
  render(<App />)
  expect(
    screen.queryByRole('button', { name: /buy|order|execute|place/i }),
  ).not.toBeInTheDocument()
  const buttons = screen.getAllByRole('button')
  expect(buttons).toHaveLength(1)
  expect(buttons[0]).toHaveAccessibleName(/theme/i)
})
