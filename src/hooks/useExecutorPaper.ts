import { useEffect, useState } from 'react'
import { simStats, type SimStats } from '../sim/stats'
import type { SimState } from '../sim/types'
import type { SimMeta } from './useServerSim'

// Nominal empty account (matches executor emptyAccount's PAPER_START) shown before the first fetch.
const EMPTY_STATE: SimState = { startingBalance: 100, balance: 100, open: null, armed: true, trades: [], nextId: 1 }
const EMPTY_META: SimMeta = { limitReachedAt: null, updatedAt: null, newsUpdatedAt: null, newsActive: false }

export type UseExecutorPaper = { state: SimState; stats: SimStats; meta: SimMeta; loading: boolean }

/**
 * Read-only view of the V2.7.1 paper record — the free ledger of mirrored TradingView trades.
 * Fetches `/api/executor/paper-state` on mount and polls every 60s; keeps the last-good state on
 * any failure and never throws. Independent of the app's Live/backtest mode.
 */
export function useExecutorPaper(): UseExecutorPaper {
  const [state, setState] = useState<SimState>(EMPTY_STATE)
  const [meta, setMeta] = useState<SimMeta>(EMPTY_META)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/executor/paper-state')
        if (!res.ok) return
        const json = (await res.json()) as { state?: SimState; meta?: SimMeta }
        if (alive && json.state) {
          setState(json.state)
          setMeta(json.meta ?? EMPTY_META)
        }
      } catch {
        // keep last-good
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    const id = setInterval(() => void load(), 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return { state, stats: simStats(state), meta, loading }
}
