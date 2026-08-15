import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Candle } from '../types'

// Vitest hoists `vi.mock` factories above other top-level statements; `vi.hoisted`
// hoists these declarations alongside it so the factory can reference them
// (plain `const` here would hit a TDZ ReferenceError since these names don't
// match vitest's auto-hoist `mock*` prefix convention).
const { removeMock, setDataMock, addSeriesMock, createChartMock, createSeriesMarkersMock } = vi.hoisted(() => {
  const removeMock = vi.fn()
  const setDataMock = vi.fn()
  const addSeriesMock = vi.fn(() => ({ setData: setDataMock, applyOptions: vi.fn() }))
  const createChartMock = vi.fn(() => ({
    addSeries: addSeriesMock,
    applyOptions: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn() }),
    remove: removeMock,
  }))
  const createSeriesMarkersMock = vi.fn()
  return { removeMock, setDataMock, addSeriesMock, createChartMock, createSeriesMarkersMock }
})

vi.mock('lightweight-charts', () => ({
  createChart: createChartMock,
  CandlestickSeries: 'Candlestick',
  LineSeries: 'Line',
  createSeriesMarkers: createSeriesMarkersMock,
}))

import { PriceChart } from './PriceChart'

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
})
