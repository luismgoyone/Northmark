import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers, TickMarkType } from 'lightweight-charts'
import type { UTCTimestamp, Time } from 'lightweight-charts'
import type { MarketContext, Candle } from '../types'
import { emaSeries } from '../indicators/ema'
import { stochasticSeries } from '../indicators/stochastic'
import { swingPoints } from '../indicators/swingPoints'
import { toCandlePoints, toLinePoints, toStochLines, toSwingMarkers } from './chartData'

/**
 * `chartData.ts` (Task 4) emits plain `number` unix-second times (`ChartTime`).
 * `lightweight-charts` v5 requires its nominal `UTCTimestamp` brand for intraday
 * series/marker `time` fields. The values are identical unix seconds — this is a
 * type-level relabeling, not a runtime conversion, so a precise nominal cast
 * (not `any`) is the correct, library-sanctioned way to bridge the two.
 */
const asUtc = (t: number): UTCTimestamp => t as UTCTimestamp

// The chart stores real UTC-second timestamps; these formatters only relabel the
// axis + crosshair in Philippine time (Asia/Manila, UTC+8) so they match the header
// clock. Data/positions are unchanged. Our `Time` values are always numeric seconds.
const MANILA_TZ = 'Asia/Manila'
function manilaLabel(time: Time, opts: Intl.DateTimeFormatOptions): string {
  const sec = typeof time === 'number' ? time : 0
  return new Date(sec * 1000).toLocaleString('en-GB', { timeZone: MANILA_TZ, hour12: false, ...opts })
}
function manilaTick(time: Time, tickMarkType: TickMarkType): string {
  switch (tickMarkType) {
    case TickMarkType.Year:
      return manilaLabel(time, { year: 'numeric' })
    case TickMarkType.Month:
      return manilaLabel(time, { month: 'short', year: 'numeric' })
    case TickMarkType.DayOfMonth:
      return manilaLabel(time, { day: '2-digit', month: 'short' })
    case TickMarkType.TimeWithSeconds:
      return manilaLabel(time, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    default:
      return manilaLabel(time, { hour: '2-digit', minute: '2-digit' })
  }
}

type Timeframe = 'M5' | 'M15' | 'H1'
const TIMEFRAMES: Timeframe[] = ['M5', 'M15', 'H1']
const CANDLES: Record<Timeframe, keyof MarketContext> = { M5: 'm5', M15: 'm15', H1: 'h1' }

/** Read a CSS custom property off the document root (theme-driven colors). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

type Props = {
  ctx: MarketContext
  emaPeriod: number
  stoch: { k: number; d: number; smooth: number }
}

export function PriceChart({ ctx, emaPeriod, stoch }: Props): ReactElement {
  const [tf, setTf] = useState<Timeframe>('M5')
  const containerRef = useRef<HTMLDivElement>(null)

  const candles: Candle[] = ctx[CANDLES[tf]]

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const up = cssVar('--pass-fg', '#0b7a4a')
    const down = cssVar('--fail-fg', '#c0392b')
    const ink2 = cssVar('--ink-2', '#545f6d')
    const border = cssVar('--border', '#d7dee7')
    const surface = cssVar('--surface', '#ffffff')

    const chart = createChart(el, {
      height: 340,
      layout: { background: { color: surface }, textColor: ink2, attributionLogo: false },
      grid: { vertLines: { color: border }, horzLines: { color: border } },
      rightPriceScale: { borderColor: border },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: manilaTick,
      },
      // Crosshair time label in Philippine time too, to match the axis + header.
      localization: {
        timeFormatter: (time: Time) =>
          manilaLabel(time, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
    })
    candleSeries.setData(toCandlePoints(candles).map((p) => ({ ...p, time: asUtc(p.time) })))

    const emaLine = chart.addSeries(LineSeries, { color: cssVar('--brand', '#c48a1a'), lineWidth: 2, priceLineVisible: false })
    emaLine.setData(toLinePoints(candles, emaSeries(candles, emaPeriod)).map((p) => ({ ...p, time: asUtc(p.time) })))

    const stochData = toStochLines(candles, stochasticSeries(candles, stoch.k, stoch.d, stoch.smooth))
    const kLine = chart.addSeries(LineSeries, { color: ink2, lineWidth: 2, priceLineVisible: false }, 1)
    kLine.setData(stochData.k.map((p) => ({ ...p, time: asUtc(p.time) })))
    const dLine = chart.addSeries(LineSeries, { color: cssVar('--brand', '#c48a1a'), lineWidth: 1, priceLineVisible: false }, 1)
    dLine.setData(stochData.d.map((p) => ({ ...p, time: asUtc(p.time) })))

    const swings = swingPoints(candles)

    /**
     * Applies the current (fresh, re-read) theme colors to the chart chrome, every
     * data series, and the swing markers. Called once on initial build and again
     * from the MutationObserver whenever `data-theme` flips, so series colors never
     * lag the chart background/grid.
     */
    const applyThemeColors = (): void => {
      const themedUp = cssVar('--pass-fg', '#0b7a4a')
      const themedDown = cssVar('--fail-fg', '#c0392b')
      const themedInk2 = cssVar('--ink-2', '#545f6d')
      const themedBrand = cssVar('--brand', '#c48a1a')
      const themedBorder = cssVar('--border', '#d7dee7')
      const themedSurface = cssVar('--surface', '#ffffff')

      chart.applyOptions({
        layout: { background: { color: themedSurface }, textColor: themedInk2 },
        grid: { vertLines: { color: themedBorder }, horzLines: { color: themedBorder } },
      })
      candleSeries.applyOptions({
        upColor: themedUp,
        downColor: themedDown,
        wickUpColor: themedUp,
        wickDownColor: themedDown,
      })
      emaLine.applyOptions({ color: themedBrand })
      kLine.applyOptions({ color: themedInk2 })
      dLine.applyOptions({ color: themedBrand })
      createSeriesMarkers(
        candleSeries,
        toSwingMarkers(candles, swings, { high: themedDown, low: themedUp }).map((m) => ({
          ...m,
          time: asUtc(m.time),
        }))
      )
    }

    createSeriesMarkers(
      candleSeries,
      toSwingMarkers(candles, swings, { high: down, low: up }).map((m) => ({ ...m, time: asUtc(m.time) }))
    )

    chart.timeScale().fitContent()

    // Re-theme when the app flips data-theme (App mutates the attribute directly).
    const observer =
      typeof MutationObserver !== 'undefined' ? new MutationObserver(() => applyThemeColors()) : null
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      observer?.disconnect()
      chart.remove()
    }
  }, [candles, emaPeriod, stoch.k, stoch.d, stoch.smooth])

  return (
    <section className="mb-4 rounded-panel border border-border bg-surface p-4 shadow-panel">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">Price</span>
        <span className="font-mono text-[12.5px] text-ink-2">XAU/USD</span>
        <div className="ml-auto inline-flex overflow-hidden rounded-chip border border-border">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              aria-pressed={tf === t}
              className={
                'px-3 py-1 text-[12px] font-semibold ' +
                (tf === t ? 'bg-surface-sunken text-ink' : 'bg-surface text-ink-2 hover:text-ink')
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} />
    </section>
  )
}
