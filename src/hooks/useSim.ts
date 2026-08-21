import { useEffect, useRef, useState } from 'react'
import type { Config, MarketContext } from '../types'
import type { SetupVerdict } from '../scoring/evaluateSetup'
import { initialSimState, simStep, type SetupSignal } from '../sim/engine'
import { simStats, type SimStats } from '../sim/stats'
import { simConfigFrom } from '../sim/config'
import type { SimConfig, SimState } from '../sim/types'

const STORAGE_KEY = 'northmark-sim-v1'

/** Load persisted sim state; fall back to a fresh state on missing/corrupt storage. */
function loadState(simConfig: SimConfig): SimState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SimState
      if (typeof parsed?.balance === 'number' && Array.isArray(parsed?.trades)) return parsed
    }
  } catch {
    // ignore corrupt storage
  }
  return initialSimState(simConfig)
}

function save(state: SimState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota/serialization errors
  }
}

function toSignal(verdict: SetupVerdict): SetupSignal {
  if (verdict.status === 'setup') {
    return { authorized: true, direction: verdict.direction, entry: verdict.entry, sl: verdict.sl, tp: verdict.tp2 }
  }
  return { authorized: false }
}

export type UseSim = { state: SimState; stats: SimStats; reset: () => void }

/**
 * Drives the pure sim reducer from live market data. Steps at most once per new M5 candle
 * (guarded by the latest candle time), only when `enabled` (Live mode) — demo never records.
 * Persists to localStorage. The impure boundary (storage) lives here, not in src/sim.
 */
export function useSim(
  ctx: MarketContext | null,
  verdict: SetupVerdict,
  enabled: boolean,
  config: Config,
): UseSim {
  const simConfig = simConfigFrom(config)
  const [state, setState] = useState<SimState>(() => loadState(simConfig))
  const lastProcessed = useRef<number | null>(null)

  // Step at most once per new candle, Live mode only.
  useEffect(() => {
    if (!enabled || !ctx) return
    const latest = ctx.m5[ctx.m5.length - 1]
    if (!latest || lastProcessed.current === latest.time) return
    lastProcessed.current = latest.time
    setState((prev) => simStep(prev, toSignal(verdict), simConfig, latest))
    // The candle-time guard is the real trigger; verdict/simConfig are read fresh from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, enabled])

  // Persist whenever the sim state changes.
  useEffect(() => {
    save(state)
  }, [state])

  const reset = (): void => {
    setState(initialSimState(simConfig))
  }

  return { state, stats: simStats(state), reset }
}
