import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSim } from './useSim'
import { defaultConfig } from '../config'
import type { Candle, MarketContext } from '../types'
import type { SetupVerdict } from '../scoring/evaluateSetup'

const candle = (time: number, high: number, low: number): Candle => ({
  time, open: (high + low) / 2, high, low, close: (high + low) / 2,
})
const ctxAt = (c: Candle): MarketContext => ({ m5: [c], m15: [c], h1: [c] })
const setup = (): SetupVerdict => ({
  status: 'setup', direction: 'long', level: 95, entry: 100, sl: 95, tp1: 105, tp2: 110, lot: 0.1,
  gates: [], supporting: [], vetoes: [], score: { passed: 7, band: 'strong', authorized: true },
})
const wait = (): SetupVerdict => ({
  status: 'wait', blockedBy: 'h1-m15-bias', direction: null,
  gates: [], supporting: [], vetoes: [], score: { passed: 0, band: 'wait', authorized: false },
})

beforeEach(() => localStorage.clear())

describe('useSim', () => {
  it('opens a paper trade on a new candle when a setup is authorized (live)', () => {
    const { result } = renderHook(() => useSim(ctxAt(candle(1, 101, 99)), setup(), true, defaultConfig))
    expect(result.current.state.open?.id).toBe('t1')
  })

  it('does not step when disabled (demo mode)', () => {
    const { result } = renderHook(() => useSim(ctxAt(candle(1, 101, 99)), setup(), false, defaultConfig))
    expect(result.current.state.open).toBeNull()
  })

  it('steps once per new candle time, not on every re-render', () => {
    const { result, rerender } = renderHook(
      ({ ctx }) => useSim(ctx, setup(), true, defaultConfig),
      { initialProps: { ctx: ctxAt(candle(1, 101, 99)) } },
    )
    expect(result.current.state.nextId).toBe(2) // t1 opened
    rerender({ ctx: ctxAt(candle(1, 101, 99)) }) // same candle time, new object
    expect(result.current.state.nextId).toBe(2) // no second open
  })

  it('persists to localStorage and a fresh hook reloads the open position', () => {
    const { unmount } = renderHook(() => useSim(ctxAt(candle(1, 101, 99)), setup(), true, defaultConfig))
    unmount()
    expect(localStorage.getItem('northmark-sim-v1')).toContain('"open"')
    const { result } = renderHook(() => useSim(null, wait(), true, defaultConfig))
    expect(result.current.state.open).not.toBeNull()
  })

  it('reset clears trades and the open position', () => {
    const { result } = renderHook(() => useSim(ctxAt(candle(1, 101, 99)), setup(), true, defaultConfig))
    act(() => result.current.reset())
    expect(result.current.state.open).toBeNull()
    expect(result.current.state.trades).toHaveLength(0)
  })
})
