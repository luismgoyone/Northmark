import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useServerSim } from './useServerSim'

const serverState = {
  startingBalance: 10_000, balance: 10_200, open: null, armed: true, nextId: 2,
  trades: [{ id: 't1', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 100, rr: 2, openedAtTime: 0, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 200, closedAtTime: 1 }],
}

const claudeServerState = {
  startingBalance: 10_000, balance: 9_900, open: null, armed: true, nextId: 1, trades: [],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ state: serverState, claudeState: claudeServerState, meta: { limitReachedAt: null, updatedAt: 123 } }),
  })))
})
afterEach(() => vi.unstubAllGlobals())

describe('useServerSim', () => {
  it('fetches the server state on mount and derives stats', async () => {
    const { result } = renderHook(() => useServerSim())
    await waitFor(() => expect(result.current.state.balance).toBe(10_200))
    expect(result.current.stats.trades).toBe(1)
    expect(result.current.meta.updatedAt).toBe(123)
    expect(result.current.loading).toBe(false)
  })

  it('derives Claude stats from claudeState', async () => {
    const { result } = renderHook(() => useServerSim())
    await waitFor(() => expect(result.current.claudeState.balance).toBe(9_900))
    expect(result.current.claudeStats.trades).toBe(0)
  })

  it('keeps the last-good state when a fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    const { result } = renderHook(() => useServerSim())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Falls back to an empty (initial) state, never throws.
    expect(result.current.state.trades).toHaveLength(0)
  })
})
