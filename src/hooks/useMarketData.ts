import { useEffect, useState } from 'react'
import type { MarketContext } from '../types'
import { fetchCandles } from '../data/twelveData'

/**
 * useMarketData — the ONLY impure bridge between the pure engine and React.
 *
 * This hook is the single place in the UI tree allowed to touch the clock and the
 * data layer. It fetches the three timeframes the engine reasons over (M5, M15, H1),
 * assembles them into a `MarketContext`, and re-polls on the M5 cadence. Everything
 * downstream consumes the resulting `ctx` as pure data; no gate/scoring internals are
 * imported here — the hook only orchestrates fetches, it does not judge them.
 *
 * Contract:
 * - `loading` is `true` only until the first fetch settles; later refreshes poll
 *   quietly in the background and never flip the screen back to a loading state.
 * - `error` holds the most recent failure. A failed *refresh* does not blank the
 *   screen: the last good `ctx` is retained so the trader keeps seeing real numbers.
 * - `ctx` is `null` until the first successful load.
 *
 * Polling alignment (MVP): candles only matter once an M5 bar has closed, so the first
 * tick is scheduled at the next M5 wall-clock boundary, after which we poll every 5
 * minutes. This is a deliberately simple approximation — a plain interval anchored to
 * the boundary. Exact close-aligned scheduling (accounting for provider publish lag and
 * interval drift) can be refined later without changing this hook's public shape.
 */

export type UseMarketData = {
  ctx: MarketContext | null
  loading: boolean
  error: Error | null
}

/** One M5 bar in milliseconds — the poll cadence and the boundary we align to. */
const M5_MS = 5 * 60 * 1000

/** Milliseconds from `now` until the next M5 wall-clock boundary (never 0, always the *next* one). */
function msUntilNextM5Boundary(now: number): number {
  const remainder = now % M5_MS
  return remainder === 0 ? M5_MS : M5_MS - remainder
}

export function useMarketData(): UseMarketData {
  const [ctx, setCtx] = useState<MarketContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Guards against setState after unmount: a fetch may still be in flight, or a timer
    // may fire, after React has torn the component down.
    let active = true
    let pollInterval: ReturnType<typeof setInterval> | undefined

    async function load(): Promise<void> {
      try {
        const [m5, m15, h1] = await Promise.all([
          fetchCandles('M5'),
          fetchCandles('M15'),
          fetchCandles('H1'),
        ])
        if (!active) return
        setCtx({ m5, m15, h1 })
        setError(null)
      } catch (err) {
        if (!active) return
        // Keep the last good `ctx` — a failed refresh must not blank the screen.
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        if (active) setLoading(false)
      }
    }

    // Fetch immediately so the screen fills as fast as possible...
    void load()

    // ...then align the recurring poll to the M5 close boundary.
    const boundaryTimeout = setTimeout(() => {
      if (!active) return
      void load()
      pollInterval = setInterval(() => {
        void load()
      }, M5_MS)
    }, msUntilNextM5Boundary(Date.now()))

    return () => {
      active = false
      clearTimeout(boundaryTimeout)
      if (pollInterval !== undefined) clearInterval(pollInterval)
    }
  }, [])

  return { ctx, loading, error }
}
