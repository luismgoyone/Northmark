import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { MarketContext } from '../types'
import { priceSummary } from './priceSummary'

/** Price/number formatting — fixed 2dp, grouped thousands (matches TradeCard). */
function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * The prominent current-price band (a "hero" ticker above the verdict). Shows the latest
 * M5 close big, plus the change since the UTC day open, colored ▲ up / ▼ down. It refreshes
 * on the same candle cadence as everything else (~5 min for M5) — the `M5 · ~5 min` hint
 * keeps it honest, so it's never mistaken for a real-time stream. On each value change the
 * number briefly flashes green/red so it reads as "live" at every new candle.
 *
 * Pure/prop-driven off `ctx.m5`; renders nothing when there's no data.
 */
export function PriceTicker({ ctx }: { ctx: MarketContext }): ReactElement | null {
  const summary = priceSummary(ctx.m5)
  const price = summary?.price ?? null
  const prev = useRef<number | null>(null)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (price === null) return
    const previous = prev.current
    prev.current = price
    if (previous === null || price === previous) return
    setFlash(price > previous ? 'up' : 'down')
    const t = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(t)
  }, [price])

  if (!summary) return null
  const up = summary.change >= 0
  const flashColor = flash === 'up' ? 'text-pass-fg' : flash === 'down' ? 'text-fail-fg' : 'text-ink'

  return (
    <section
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-b border-border px-5 py-3.5"
      aria-label="Current price"
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">XAU/USD</span>
      <span
        className={`font-mono text-[30px] font-bold leading-none tabular-nums transition-colors duration-500 ${flashColor}`}
      >
        {fmt(summary.price)}
      </span>
      <span
        className={`inline-flex items-center gap-1 font-mono text-[14px] font-semibold tabular-nums ${
          up ? 'text-pass-fg' : 'text-fail-fg'
        }`}
      >
        <span aria-hidden="true">{up ? '▲' : '▼'}</span>
        {` ${fmt(Math.abs(summary.change))} (${up ? '+' : '−'}${Math.abs(summary.changePct).toFixed(2)}%)`}
        <span className="sr-only">{up ? 'up' : 'down'} since day open</span>
      </span>
      <span className="ml-auto text-[11px] text-ink-3">since day open · M5 · ~5 min</span>
    </section>
  )
}
