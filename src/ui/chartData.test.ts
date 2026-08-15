import { describe, it, expect } from 'vitest'
import type { Candle } from '../types'
import { toCandlePoints, toLinePoints, toStochLines, toSwingMarkers } from './chartData'

const mk = (closes: number[]): Candle[] =>
  closes.map((c, i) => ({ time: (i + 1) * 60_000, open: c, high: c + 1, low: c - 1, close: c }))

describe('toCandlePoints', () => {
  it('converts ms→s and preserves OHLC', () => {
    const [p] = toCandlePoints(mk([100]))
    expect(p).toEqual({ time: 60, open: 100, high: 101, low: 99, close: 100 })
  })
})

describe('toLinePoints', () => {
  it('drops null warmup entries and aligns time', () => {
    const candles = mk([1, 2, 3])
    const out = toLinePoints(candles, [null, 2, 3])
    expect(out).toEqual([
      { time: 120, value: 2 },
      { time: 180, value: 3 },
    ])
  })
})

describe('toStochLines', () => {
  it('splits into k and d lines, skipping nulls', () => {
    const candles = mk([1, 2])
    const out = toStochLines(candles, [null, { k: 60, d: 55 }])
    expect(out.k).toEqual([{ time: 120, value: 60 }])
    expect(out.d).toEqual([{ time: 120, value: 55 }])
  })
})

describe('toSwingMarkers', () => {
  it('maps highs above / lows below and sorts ascending by time', () => {
    const candles = mk([1, 2, 3, 4])
    const out = toSwingMarkers(
      candles,
      { highs: [2], lows: [1] },
      { high: '#aaa', low: '#bbb' },
    )
    expect(out.map((m) => m.time)).toEqual([120, 180]) // sorted: low@idx1(t=120), high@idx2(t=180)
    expect(out[0]).toMatchObject({ position: 'belowBar', shape: 'arrowUp', color: '#bbb' })
    expect(out[1]).toMatchObject({ position: 'aboveBar', shape: 'arrowDown', color: '#aaa' })
  })
})
