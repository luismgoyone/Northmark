import { useEffect, useState } from 'react'
import type { Candle, MarketContext } from '../types'
import { fetchCandles, type Timeframe } from '../data/twelveData'

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
 * Polling alignment (MVP): a bar only matters once it has closed, and each timeframe
 * closes on its own clock — an H1 bar changes once an hour, an M15 bar every 15 minutes.
 * Refetching all three on the M5 cadence spends ~864 Twelve-Data credits/day (over the
 * 800/day free-tier cap) to re-download H1/M15 bars that have not changed. Instead each
 * timeframe is polled on *its own* aligned cadence (M5→5m, M15→15m, H1→60m), which cuts
 * steady state to ~408 credits/day and keeps the per-minute burst well under the 8/min
 * cap. Exact close-aligned scheduling (provider publish lag, interval drift) can be
 * refined later without changing this hook's public shape.
 */

export type UseMarketData = {
  ctx: MarketContext | null
  loading: boolean
  error: Error | null
}

/** Per-timeframe poll cadence (ms) — also the wall-clock boundary each is aligned to. */
const PERIOD_MS: Record<Timeframe, number> = {
  M5: 5 * 60 * 1000,
  M15: 15 * 60 * 1000,
  H1: 60 * 60 * 1000,
}

/** The three timeframes the engine reasons over, in fetch order. */
const TIMEFRAMES: Timeframe[] = ['M5', 'M15', 'H1']

/** Milliseconds from `now` until the next `period` wall-clock boundary (never 0, always the *next* one). */
function msUntilNextBoundary(now: number, period: number): number {
  const remainder = now % period
  return remainder === 0 ? period : period - remainder
}

export function useMarketData(enabled: boolean = true): UseMarketData {
  const [ctx, setCtx] = useState<MarketContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!enabled) return

    // Guards against setState after unmount: a fetch may still be in flight, or a timer
    // may fire, after React has torn the component down.
    let active = true
    const timers: ReturnType<typeof setTimeout>[] = []
    // Latest candles per timeframe. `ctx` is only published once all three are present,
    // then each subsequent per-timeframe fetch updates just its own slice.
    const latest: Partial<Record<Timeframe, Candle[]>> = {}

    function publish(): void {
      const { M5, M15, H1 } = latest
      if (M5 && M15 && H1) setCtx({ m5: M5, m15: M15, h1: H1 })
    }

    async function loadOne(tf: Timeframe): Promise<void> {
      try {
        const candles = await fetchCandles(tf)
        if (!active) return
        latest[tf] = candles
        setError(null)
        publish()
      } catch (err) {
        if (!active) return
        // Keep the last good `ctx` — a failed refresh must not blank the screen.
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    }

    // Fetch all three immediately so the screen fills as fast as possible...
    void Promise.all(TIMEFRAMES.map(loadOne)).finally(() => {
      if (active) setLoading(false)
    })

    // ...then poll each timeframe on its own boundary-aligned cadence.
    for (const tf of TIMEFRAMES) {
      const period = PERIOD_MS[tf]
      const boundaryTimeout = setTimeout(() => {
        if (!active) return
        void loadOne(tf)
        const pollInterval = setInterval(() => {
          void loadOne(tf)
        }, period)
        timers.push(pollInterval)
      }, msUntilNextBoundary(Date.now(), period))
      timers.push(boundaryTimeout)
    }

    return () => {
      active = false
      for (const t of timers) {
        clearTimeout(t)
        clearInterval(t)
      }
    }
  }, [enabled])

  return { ctx, loading, error }
}
