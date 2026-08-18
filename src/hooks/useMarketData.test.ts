import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candle } from '../types'
import type { Timeframe } from '../data/twelveData'

// Mock the ONLY I/O module. The hook must reach the network solely through this.
vi.mock('../data/twelveData', () => ({
  fetchCandles: vi.fn(),
}))

import { fetchCandles } from '../data/twelveData'
import { useMarketData } from './useMarketData'

const mockFetch = vi.mocked(fetchCandles)

const M5_MS = 5 * 60 * 1000

/** A one-bar candle series, distinct per timeframe so we can assert the right slot is filled. */
function candlesFor(tf: Timeframe): Candle[] {
  const close = tf === 'M5' ? 2100 : tf === 'M15' ? 2200 : 2300
  return [{ time: 1_000_000, open: close, high: close + 1, low: close - 1, close }]
}

/**
 * Flush pending microtasks (Promise.all resolution) without leaving fake-timer land.
 * Promises are NOT faked by vi.useFakeTimers, so a handful of awaits drains the queue.
 */
async function flushPromises(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  // Pin to an exact M5 boundary so the first-tick delay is a full, predictable 5 minutes.
  vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'))
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (tf: Timeframe) => candlesFor(tf))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('useMarketData', () => {
  it('starts loading with a null context before the first fetch resolves', async () => {
    const { result } = renderHook(() => useMarketData())

    expect(result.current.loading).toBe(true)
    expect(result.current.ctx).toBeNull()
    expect(result.current.error).toBeNull()

    // Drain the in-flight initial fetch so its resolution settles inside act().
    await flushPromises()
  })

  it('assembles ctx from M5/M15/H1 once the initial fetch resolves', async () => {
    const { result } = renderHook(() => useMarketData())

    await flushPromises()

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.ctx).not.toBeNull()
    expect(result.current.ctx?.m5[0]?.close).toBe(2100)
    expect(result.current.ctx?.m15[0]?.close).toBe(2200)
    expect(result.current.ctx?.h1[0]?.close).toBe(2300)

    // Each timeframe fetched exactly once on mount.
    expect(mockFetch).toHaveBeenCalledWith('M5')
    expect(mockFetch).toHaveBeenCalledWith('M15')
    expect(mockFetch).toHaveBeenCalledWith('H1')
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('surfaces the error and stops loading when a fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('twelve data down'))

    const { result } = renderHook(() => useMarketData())

    await flushPromises()

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('twelve data down')
    expect(result.current.ctx).toBeNull()
  })

  it('keeps the last good ctx when a later refresh fails', async () => {
    const { result } = renderHook(() => useMarketData())

    await flushPromises()
    const goodCtx = result.current.ctx
    expect(goodCtx).not.toBeNull()

    // Next poll rejects.
    mockFetch.mockRejectedValue(new Error('refresh failed'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(M5_MS)
    })

    // Screen is not blanked: ctx is preserved, error is set.
    expect(result.current.ctx).toBe(goodCtx)
    expect(result.current.error?.message).toBe('refresh failed')
  })

  it('polls each timeframe on its own cadence, not all three every 5 minutes', async () => {
    renderHook(() => useMarketData())

    await flushPromises()
    // Initial burst: one fetch each.
    expect(mockFetch).toHaveBeenCalledTimes(3)
    const callsFor = (tf: Timeframe) => mockFetch.mock.calls.filter(([t]) => t === tf).length

    // After 5 minutes: only M5 has closed again — M15/H1 untouched.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(M5_MS)
    })
    expect(callsFor('M5')).toBe(2)
    expect(callsFor('M15')).toBe(1)
    expect(callsFor('H1')).toBe(1)

    // Reach 15 minutes total (fires at 0,5,10,15): M5 4×, M15 now 2×, H1 still 1×.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * M5_MS)
    })
    expect(callsFor('M5')).toBe(4)
    expect(callsFor('M15')).toBe(2)
    expect(callsFor('H1')).toBe(1)

    // Reach 60 minutes total: M5 at 0..60/5m = 13×, M15 at 0/15/30/45/60 = 5×,
    // H1 finally polls a second time (0 and 60).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * M5_MS)
    })
    expect(callsFor('M5')).toBe(13)
    expect(callsFor('M15')).toBe(5)
    expect(callsFor('H1')).toBe(2)
  })

  it('clears timers on unmount and does not refetch afterward', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = renderHook(() => useMarketData())

    await flushPromises()
    expect(mockFetch).toHaveBeenCalledTimes(3)

    unmount()
    mockFetch.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(M5_MS * 3)
    })

    // No timer survived unmount → no further fetches, no setState-after-unmount noise.
    expect(mockFetch).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
