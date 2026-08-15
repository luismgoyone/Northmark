import type { Candle } from '../types'

/** lightweight-charts intraday time is a UTC timestamp in SECONDS. */
export type ChartTime = number

export type CandlePoint = { time: ChartTime; open: number; high: number; low: number; close: number }
export type LinePoint = { time: ChartTime; value: number }
export type SwingMarker = {
  time: ChartTime
  position: 'aboveBar' | 'belowBar'
  shape: 'arrowDown' | 'arrowUp'
  color: string
  text: string
}

const toSec = (ms: number): ChartTime => Math.floor(ms / 1000)

/** `Candle[]` → candlestick series data (ms→s, OHLC preserved). */
export function toCandlePoints(candles: Candle[]): CandlePoint[] {
  return candles.map((c) => ({
    time: toSec(c.time),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }))
}

/** A nullable per-bar series → line points, dropping warmup nulls. */
export function toLinePoints(candles: Candle[], series: (number | null)[]): LinePoint[] {
  const out: LinePoint[] = []
  for (let i = 0; i < candles.length; i++) {
    const v = series[i]
    if (v == null) continue
    out.push({ time: toSec(candles[i]!.time), value: v })
  }
  return out
}

/** Stochastic series → separate %K and %D line data. */
export function toStochLines(
  candles: Candle[],
  series: ({ k: number; d: number } | null)[],
): { k: LinePoint[]; d: LinePoint[] } {
  const k: LinePoint[] = []
  const d: LinePoint[] = []
  for (let i = 0; i < candles.length; i++) {
    const p = series[i]
    if (p == null) continue
    const time = toSec(candles[i]!.time)
    k.push({ time, value: p.k })
    d.push({ time, value: p.d })
  }
  return { k, d }
}

/** Swing indices → markers, merged and sorted ascending by time. */
export function toSwingMarkers(
  candles: Candle[],
  swings: { highs: number[]; lows: number[] },
  colors: { high: string; low: string },
): SwingMarker[] {
  const markers: SwingMarker[] = []
  for (const i of swings.highs) {
    const c = candles[i]
    if (!c) continue
    markers.push({ time: toSec(c.time), position: 'aboveBar', shape: 'arrowDown', color: colors.high, text: '' })
  }
  for (const i of swings.lows) {
    const c = candles[i]
    if (!c) continue
    markers.push({ time: toSec(c.time), position: 'belowBar', shape: 'arrowUp', color: colors.low, text: '' })
  }
  return markers.sort((a, b) => a.time - b.time)
}
