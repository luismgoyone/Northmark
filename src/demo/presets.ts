import type { Config, MarketContext } from '../types'
import { defaultConfig } from '../config'
import { fullNarrative, rangeSeries, trendSeries, withTimes } from './candles'

export type DemoMode = 'demo-setup' | 'demo-building' | 'demo-wait'
export type Mode = 'live' | DemoMode
export type DemoPreset = { id: DemoMode; label: string; ctx: MarketContext; config?: Config }

const M5_STEP_MS = 5 * 60_000
const M15_STEP_MS = 15 * 60_000
const H1_STEP_MS = 60 * 60_000

// Each preset reuses fixtures already proven (in evaluateSetup.test.ts) to drive the engine to
// the intended verdict — see presets.test.ts, which pins them so they can't silently drift.
// Candle `time` values are rewritten to realistic epoch-ms via `withTimes` purely so the price
// chart can render (the engine ignores `time`, so this never changes a verdict).
export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'demo-setup',
    label: 'Authorized LONG — STRONG',
    // fullNarrative M5 + clean long structure on M15/H1 → status 'setup', direction 'long'.
    // Both supporting checks agree (M15 structure confirms long, EMA9 rising) → STRONG band.
    ctx: {
      m5: withTimes(fullNarrative(), M5_STEP_MS),
      m15: withTimes(trendSeries('up', 6), M15_STEP_MS),
      h1: withTimes(trendSeries('up', 6), H1_STEP_MS),
    },
    // A larger account than defaultConfig's $200 so the lot size the card shows is legible
    // (defaultConfig's $200 @ 1% risking a $5 stop yields ~0.004 lots — illegible for a demo).
    config: { ...defaultConfig, accountSize: 10_000 },
  },
  {
    id: 'demo-building',
    label: 'Authorized LONG — BUILDING (M15 unconfirmed)',
    // Every one of the 7 HARD filters passes (fullNarrative M5 + H1 uptrend → bias long, EMA9
    // rising), but M15 structure does NOT confirm long (range) → that SUPPORTING check is
    // withheld, so the setup still AUTHORIZES but with a lowered BUILDING band (not STRONG).
    // This is the reframe's headline case — a supporting disagreement lowers conviction without
    // blocking the trade. Mirrors evaluateSetup.test's "M15 disagrees" scenario. Same $10k demo
    // config as demo-setup so the trade card's lot stays legible.
    ctx: {
      m5: withTimes(fullNarrative(), M5_STEP_MS),
      m15: withTimes(rangeSeries(), M15_STEP_MS),
      h1: withTimes(trendSeries('up', 6), H1_STEP_MS),
    },
    config: { ...defaultConfig, accountSize: 10_000 },
  },
  {
    id: 'demo-wait',
    label: 'WAIT — H1 bias unclear',
    // A flat range → H1 direction unclear → wait@h1-m15-bias (the live-like empty state).
    ctx: {
      m5: withTimes(rangeSeries(), M5_STEP_MS),
      m15: withTimes(rangeSeries(), M15_STEP_MS),
      h1: withTimes(rangeSeries(), H1_STEP_MS),
    },
  },
]
