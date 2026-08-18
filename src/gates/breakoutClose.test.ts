import { describe, expect, it } from 'vitest'
import type { Candle, Config, Direction } from '../types'
import { breakoutClose } from './breakoutClose'
import { defaultConfig } from '../config'
import breakoutFixture from '../../tests/fixtures/breakout-retest.json'

const breakout = breakoutFixture as Candle[]

// defaultConfig.tolerances.breakoutBufferPips = 20; XAUUSD price-per-pip = 0.01 → buffer = $0.20.
const config: Config = defaultConfig
const LEVEL = 2100

// buffer in price units: breakoutBufferPips * 0.01 (0.01/pip XAUUSD convention)
const BUF = defaultConfig.tolerances.breakoutBufferPips * 0.01 // 0.20

/** Build a single explicit candle; only OHLC matter for this gate. */
function candle(o: number, h: number, l: number, c: number): Candle {
  return { time: 0, open: o, high: h, low: l, close: c }
}

describe('breakoutClose', () => {
  describe('(a) clean close above level + buffer', () => {
    // Fixture README: first close above 2100 is index 20 (close = 2106).
    // Slice so the breakout candle is the LAST candle.
    const sliced = breakout.slice(0, 21)

    it('returns pass', () => {
      expect(breakoutClose(sliced, LEVEL, 'long' as Direction, config).status).toBe('pass')
    })

    it('uses the breakout-close gate id', () => {
      expect(breakoutClose(sliced, LEVEL, 'long' as Direction, config).id).toBe('breakout-close')
    })
  })

  describe('(b) wick above but close at/below level (failed breakout) — THE critical case', () => {
    // high pierces the level, but the candle closes back below it: NOT a breakout.
    const wickOnly = [candle(2098, 2105, 2097, 2099)]

    it('returns fail (a wick is not a breakout)', () => {
      expect(breakoutClose(wickOnly, LEVEL, 'long' as Direction, config).status).toBe('fail')
    })
  })

  describe('(c) price entirely below the level (no attempt)', () => {
    // Fixture indices 0–19 have highs capped at 2099 (≤ level 2100).
    const belowLevel = breakout.slice(0, 20)

    it('returns wait', () => {
      expect(breakoutClose(belowLevel, LEVEL, 'long' as Direction, config).status).toBe('wait')
    })
  })

  describe('(d) close exactly at the level', () => {
    // close == level is NOT above level + buffer, so it must never pass.
    const closeAtLevel = [candle(2098, 2101, 2097, 2100)]

    it('does not pass', () => {
      expect(breakoutClose(closeAtLevel, LEVEL, 'long' as Direction, config).status).not.toBe('pass')
    })
  })

  describe('close exactly at level + buffer (boundary)', () => {
    // threshold = LEVEL + BUF. A close of exactly the threshold is NOT strictly above.
    const closeAtThreshold = [candle(2100, LEVEL + BUF + 1, 2099, LEVEL + BUF)]

    it('does not pass (breakout requires strictly above level + buffer)', () => {
      expect(breakoutClose(closeAtThreshold, LEVEL, 'long' as Direction, config).status).not.toBe('pass')
    })
  })

  describe('empty input', () => {
    it('biases toward wait rather than a false pass', () => {
      expect(breakoutClose([], LEVEL, 'long' as Direction, config).status).toBe('wait')
    })
  })

  it('short: passes when close is below level minus buffer', () => {
    const level = 1000
    const candles = [{ time: 0, open: 1000, high: 1000, low: 998, close: 1000 - BUF - 0.01 }]
    const r = breakoutClose(candles, level, 'short' as Direction, defaultConfig)
    expect(r.status).toBe('pass')
  })

  it('short: wick below but close inside is a failed breakout', () => {
    const level = 1000
    const candles = [{ time: 0, open: 1000, high: 1001, low: 990, close: 1000 - 0.01 }]
    expect(breakoutClose(candles, level, 'short' as Direction, defaultConfig).status).toBe('fail')
  })
})
