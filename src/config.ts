import type { Config } from './types.js'

export const defaultConfig: Config = {
  instrument: 'XAUUSD',
  accountSize: 200,
  riskPct: 0.01,
  // contractSize: XAUUSD pip→dollar convention pending confirmation with Luis at the phase boundary.
  contractSize: 100,
  ema: { period: 9 },
  minRR: 1.5,

  // Tunable Tier-2 defaults (bias-toward-WAIT); product-lead may recalibrate.
  stoch: { k: 14, d: 3, smooth: 3, overbought: 80, oversold: 20 },

  // Structure-driven bounds (checklist Critical Implementation Principle — NOT magic
  // triggers). retestBand: max fractional distance (0.05% of price) that still counts as
  // "touching" the level. breakoutBufferPips: UPPER BOUND on the price-unit breakout buffer
  // (0.01/pip XAUUSD convention → 20 pips = 0.20 price); the gate scales within this bound to
  // recent range, never a fixed pip magnitude. consolidationLookback: MAX window (candles)
  // the consolidation gate inspects, not a fixed "N flat candles = range" rule. All UNVALIDATED
  // until calibrated against past charts (Luis owns calibration before live signals are trusted).
  tolerances: { retestBand: 0.0005, breakoutBufferPips: 20, consolidationLookback: 20 },
}
