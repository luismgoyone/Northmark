import { useEffect, useState } from 'react'
import { defaultConfig } from '../config'
import { simConfigFrom } from '../sim/config'
import { initialSimState } from '../sim/engine'
import { simStats, type SimStats } from '../sim/stats'
import type { SimState } from '../sim/types'

export type SimMeta = { limitReachedAt: number | null; updatedAt: number | null }
export type UseServerSim = { state: SimState; stats: SimStats; meta: SimMeta; loading: boolean }

const EMPTY_META: SimMeta = { limitReachedAt: null, updatedAt: null }

/**
 * Read-only view of the shared server forward-test. Fetches `/api/sim-state` on mount and polls
 * every 60s. On any failure it keeps the last-good state and never throws. The server owns
 * ticking now; this hook does not step or persist anything.
 */
export function useServerSim(): UseServerSim {
  const [state, setState] = useState<SimState>(() => initialSimState(simConfigFrom(defaultConfig)))
  const [meta, setMeta] = useState<SimMeta>(EMPTY_META)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/sim-state')
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
