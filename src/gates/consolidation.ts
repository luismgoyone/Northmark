import type { Candle, Config, GateResult } from '../types.js'
import { ema } from '../indicators/ema.js'

/**
 * Consolidation = a clear range, detected from PRICE BEHAVIOR (checklist step 3 + the
 * Critical Implementation Principle), never a fixed "N flat candles" rule. This is a
 * CURRENT-CHOP filter: it verifies price is not ranging AT THE ENTRY MOMENT (the trailing
 * window it's called on), not that a base preceded the breakout — a base→breakout quality
 * check would be a separate, inverted-polarity gate (deferred to Phase 2.5). Three signals,
 * all required, over the last `consolidationLookback` bars (a MAX window bound):
 *   1. Overlapping bodies — the range of candle CLOSES is small vs the full high-low span.
 *   2. Flat EMA9 — `ema().slope === 'flat'` (the indicator's own volatility-aware epsilon).
 *   3. Mid-range price — the last close sits in the middle third of the window's high-low span.
 * When all three hold → `fail` (NO-TRADE). Otherwise clean progression → `pass`.
 */
export function consolidation(candles: Candle[], config: Config): GateResult {
  const id = 'consolidation'
  const period = config.ema.period

  // Guard on the SLICED window, not the raw feed: `ema(window, period)` needs `period`
  // bars, and `consolidationLookback` is an UNVALIDATED tolerance that could be recalibrated
  // below `ema.period`. Checking the window keeps this gate's always-resolves contract.
  const window = candles.slice(-config.tolerances.consolidationLookback)
  if (window.length < period) {
    return { id, status: 'wait', detail: `Need ≥${period} candles in the lookback window to judge consolidation, got ${window.length}.` }
  }

  const highs = window.map((c) => c.high)
  const lows = window.map((c) => c.low)
  const closes = window.map((c) => c.close)
  const top = Math.max(...highs)
  const bottom = Math.min(...lows)
  const span = top - bottom
  if (span <= 0) return { id, status: 'fail', detail: 'Zero-span window: fully overlapping bars — consolidation.' }

  // 1. Overlapping bodies: closes occupy a small fraction of the full span.
  // NOTE: 0.5 is a PROVISIONAL / UNVALIDATED heuristic bound (per the checklist's Critical
  // Implementation Principle) pending Luis' calibration against real charts — same status as
  // the `tolerances` in config.ts. Do not treat as a validated magic number.
  const closeSpan = Math.max(...closes) - Math.min(...closes)
  const overlapping = closeSpan / span < 0.5 // closes cluster within half the range

  // 2. Flat EMA9 (volatility-aware epsilon lives in the indicator).
  const flat = ema(window, period).slope === 'flat'

  // 3. Mid-range: last close within the middle third of the span.
  // NOTE: the 1/3–2/3 bounds are likewise PROVISIONAL / UNVALIDATED heuristic thresholds
  // pending Luis' calibration against real charts — not validated magic numbers.
  const last = window[window.length - 1]!.close
  const pos = (last - bottom) / span
  const midRange = pos > 1 / 3 && pos < 2 / 3

  if (overlapping && flat && midRange) {
    return { id, status: 'fail', detail: `Consolidation: closes span ${(closeSpan / span).toFixed(2)} of range, EMA9 flat, price mid-range (${pos.toFixed(2)}). No trade.` }
  }
  return { id, status: 'pass', detail: `No consolidation (overlapping=${overlapping}, flat=${flat}, midRange=${midRange}): clean progression.` }
}
