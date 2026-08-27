import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Candle } from '../types'

// Vitest hoists `vi.mock` factories above other top-level statements; `vi.hoisted`
// hoists these declarations alongside it so the factory can reference them
// (plain `const` here would hit a TDZ ReferenceError since these names don't
// match vitest's auto-hoist `mock*` prefix convention).
const { removeMock, setDataMock, addSeriesMock, createChartMock, createSeriesMarkersMock, createPriceLineMock } =
  vi.hoisted(() => {
    const removeMock = vi.fn()
    const setDataMock = vi.fn()
    const createPriceLineMock = vi.fn()
    const addSeriesMock = vi.fn(() => ({
      setData: setDataMock,
      applyOptions: vi.fn(),
      createPriceLine: createPriceLineMock,
    }))
    const createChartMock = vi.fn(() => ({
      addSeries: addSeriesMock,
      applyOptions: vi.fn(),
      timeScale: () => ({ fitContent: vi.fn() }),
      remove: removeMock,
    }))
    const createSeriesMarkersMock = vi.fn()
    return { removeMock, setDataMock, addSeriesMock, createChartMock, createSeriesMarkersMock, createPriceLineMock }
  })

vi.mock('lightweight-charts', () => ({
  createChart: createChartMock,
  CandlestickSeries: 'Candlestick',
  LineSeries: 'Line',
  createSeriesMarkers: createSeriesMarkersMock,
}))

import { PriceChart } from './PriceChart'
import type { SimState, SimTrade } from '../sim/types'

const openState: SimState = {
  startingBalance: 200, balance: 200, armed: false, nextId: 2, trades: [],
  open: { id: 'p1', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2, openedAtTime: 60_000 },
}

// A closed trade that OPENS on an early candle (time 180s) — earlier than a swing
// high that forms on a later candle. Its marker must interleave BEFORE that swing
// marker, so a naive [...swings, ...trades] concat is out of order.
const interleavedTrade: SimTrade = {
  id: 't1', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2,
  openedAtTime: 180_000, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 4, closedAtTime: 240_000,
}

// Flat candles with a single strict swing high at a LATE index (15 → time 960s),
// which is well after the trade's open candle (index 2 → time 180s).
const swingSeries = (): Candle[] => {
  const arr: Candle[] = Array.from({ length: 20 }, (_, i) => ({
    time: (i + 1) * 60_000, open: 100, high: 101, low: 99, close: 100,
  }))
  arr[15] = { ...arr[15]!, high: 105 }
  return arr
}

const series = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: (i + 1) * 60_000, open: 100, high: 101, low: 99, close: 100 }))

const ctx = { m5: series(40), m15: series(40), h1: series(40) }
const props = { ctx, emaPeriod: 9, stoch: { k: 14, d: 3, smooth: 3 } }

beforeEach(() => {
  createChartMock.mockClear()
  addSeriesMock.mockClear()
  setDataMock.mockClear()
  removeMock.mockClear()
  createSeriesMarkersMock.mockClear()
  createPriceLineMock.mockClear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('PriceChart', () => {
  it('creates a chart and adds candlestick + overlay series', () => {
    render(<PriceChart {...props} />)
    expect(createChartMock).toHaveBeenCalledTimes(1)
    // candles + EMA9 + stoch %K + stoch %D = 4 series minimum
    expect(addSeriesMock.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(setDataMock).toHaveBeenCalled()
  })

  it('renders the M5/M15/H1 timeframe toggle', () => {
    render(<PriceChart {...props} />)
    expect(screen.getByRole('button', { name: 'M5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'M15' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'H1' })).toBeInTheDocument()
  })

  it('rebuilds the chart when the timeframe changes', () => {
    render(<PriceChart {...props} />)
    createChartMock.mockClear()
    removeMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'H1' }))
    expect(removeMock).toHaveBeenCalled() // old chart torn down
    expect(createChartMock).toHaveBeenCalledTimes(1) // new one built
  })

  it('tears the chart down on unmount', () => {
    const { unmount } = render(<PriceChart {...props} />)
    unmount()
    expect(removeMock).toHaveBeenCalled()
  })

  it('re-themes candle, EMA, stochastic, and marker colors on light/dark toggle', async () => {
    render(<PriceChart {...props} />)

    // addSeries is called in order: candleSeries, emaLine, kLine, dLine.
    const [candleSeries, emaLine, kLine, dLine] = addSeriesMock.mock.results.map((r) => r.value)
    candleSeries.applyOptions.mockClear()
    emaLine.applyOptions.mockClear()
    kLine.applyOptions.mockClear()
    dLine.applyOptions.mockClear()
    createSeriesMarkersMock.mockClear()

    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(candleSeries.applyOptions).toHaveBeenCalled()
    })
    // Candle colors must be re-applied (upColor/downColor/wicks), not just chart chrome.
    expect(candleSeries.applyOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        upColor: expect.any(String),
        downColor: expect.any(String),
        wickUpColor: expect.any(String),
        wickDownColor: expect.any(String),
      })
    )
    expect(emaLine.applyOptions).toHaveBeenCalledWith(expect.objectContaining({ color: expect.any(String) }))
    expect(kLine.applyOptions).toHaveBeenCalledWith(expect.objectContaining({ color: expect.any(String) }))
    expect(dLine.applyOptions).toHaveBeenCalledWith(expect.objectContaining({ color: expect.any(String) }))
    // Swing markers are re-created with fresh theme colors on re-theme (initial + retheme).
    expect(createSeriesMarkersMock).toHaveBeenCalledTimes(1)
  })

  it('draws position price lines when live with an open position', () => {
    render(<PriceChart {...props} live dadState={openState} claudeState={{ ...openState, open: null }} />)
    // entry + sl + tp = 3 lines for the one open (dad) position
    expect(createPriceLineMock).toHaveBeenCalledTimes(3)
  })

  it('draws no overlays when not live', () => {
    render(<PriceChart {...props} live={false} dadState={openState} claudeState={openState} />)
    expect(createPriceLineMock).not.toHaveBeenCalled()
  })

  it('passes markers to createSeriesMarkers globally sorted by time (trade interleaved before a later swing)', () => {
    const candles = swingSeries()
    const swingCtx = { m5: candles, m15: candles, h1: candles }
    const dad: SimState = { startingBalance: 200, balance: 200, armed: false, nextId: 2, open: null, trades: [interleavedTrade] }
    const claude: SimState = { ...dad, trades: [] }

    render(
      <PriceChart ctx={swingCtx} emaPeriod={9} stoch={{ k: 14, d: 3, smooth: 3 }} live dadState={dad} claudeState={claude} />
    )

    const arr = createSeriesMarkersMock.mock.calls.at(-1)![1] as Array<{ time: number; text?: string }>
    // The merged array must be globally ascending by time — a concat of two sorted
    // lists is NOT, which silently drops markers in lightweight-charts v5.
    expect(arr).toEqual([...arr].sort((a, b) => a.time - b.time))
    // ...and a trade marker must actually be present (guards against a vacuous pass).
    expect(arr.some((m) => m.text?.startsWith?.('D') || m.text === 'D' || m.text?.startsWith?.('C:'))).toBe(true)
  })
})
