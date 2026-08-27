import { describe, expect, it } from 'vitest'
import { atr } from './atr'
import type { Candle } from '../types'

const c = (high: number, low: number, close: number): Candle => ({ time: 0, open: close, high, low, close })

describe('atr', () => {
  it('averages True Range over the period', () => {
    // TR for bars 2..4 (prevClose given): each constructed to TR = 10.
    const candles: Candle[] = [
      c(100, 90, 95), // seed prevClose = 95
      c(105, 95, 100), // TR = max(10, |105-95|, |95-95|) = 10
      c(110, 100, 105), // TR = max(10, |110-100|, |100-100|) = 10
      c(115, 105, 110), // TR = 10
    ]
    expect(atr(candles, 3)).toBe(10)
  })

  it('captures gap-driven True Range beyond the bar range', () => {
    const candles: Candle[] = [c(10, 8, 9), c(30, 28, 29)] // TR = max(2, |30-9|, |28-9|) = 21
    expect(atr(candles, 1)).toBe(21)
  })

  it('throws when there are too few candles', () => {
    expect(() => atr([c(1, 0, 0.5)], 3)).toThrow(/at least/)
  })
})
