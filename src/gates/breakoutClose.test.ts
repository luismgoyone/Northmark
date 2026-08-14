import { describe, expect, it } from 'vitest'
import type { Candle, Config } from '../types'
import { breakoutClose } from './breakoutClose'
import { defaultConfig } from '../config'
import breakoutFixture from '../../tests/fixtures/breakout-retest.json'

const breakout = breakoutFixture as Candle[]

// defaultConfig.tolerances.breakoutBufferPips = 20; XAUUSD PIP = 0.1 → buffer = $2.0.
const config: Config = defaultConfig
const LEVEL = 2100

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
      expect(breakoutClose(sliced, LEVEL, config).status).toBe('pass')
    })

    it('uses the breakout-close gate id', () => {
      expect(breakoutClose(sliced, LEVEL, config).id).toBe('breakout-close')
    })
  })

  describe('(b) wick above but close at/below level (failed breakout) — THE critical case', () => {
    // high pierces the level, but the candle closes back below it: NOT a breakout.
    const wickOnly = [candle(2098, 2105, 2097, 2099)]

    it('returns fail (a wick is not a breakout)', () => {
      expect(breakoutClose(wickOnly, LEVEL, config).status).toBe('fail')
    })
  })

  describe('(c) price entirely below the level (no attempt)', () => {
    // Fixture indices 0–19 have highs capped at 2099 (≤ level 2100).
    const belowLevel = breakout.slice(0, 20)

    it('returns wait', () => {
      expect(breakoutClose(belowLevel, LEVEL, config).status).toBe('wait')
    })
  })

  describe('(d) close exactly at the level', () => {
    // close == level is NOT above level + buffer, so it must never pass.
    const closeAtLevel = [candle(2098, 2101, 2097, 2100)]

    it('does not pass', () => {
      expect(breakoutClose(closeAtLevel, LEVEL, config).status).not.toBe('pass')
    })
  })

  describe('close exactly at level + buffer (boundary)', () => {
    // buffer = 2.0 → threshold = 2102. A close of exactly 2102 is NOT strictly above.
    const closeAtThreshold = [candle(2100, 2103, 2099, 2102)]

    it('does not pass (breakout requires strictly above level + buffer)', () => {
      expect(breakoutClose(closeAtThreshold, LEVEL, config).status).not.toBe('pass')
    })
  })

  describe('empty input', () => {
    it('biases toward wait rather than a false pass', () => {
      expect(breakoutClose([], LEVEL, config).status).toBe('wait')
    })
  })
})
