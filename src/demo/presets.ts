import type { MarketContext } from '../types'
import { fullNarrative, rangeSeries, trendSeries } from './candles'

export type DemoMode = 'demo-setup' | 'demo-building' | 'demo-wait'
export type Mode = 'live' | DemoMode
export type DemoPreset = { id: DemoMode; label: string; ctx: MarketContext }

// Each preset reuses fixtures already proven (in evaluateSetup.test.ts) to drive the engine to
// the intended verdict — see presets.test.ts, which pins them so they can't silently drift.
export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'demo-setup',
    label: 'Authorized LONG setup',
    // fullNarrative M5 + clean long structure on M15/H1 → status 'setup', direction 'long'.
    ctx: { m5: fullNarrative(), m15: trendSeries('up', 6), h1: trendSeries('up', 6) },
  },
  {
    id: 'demo-building',
    label: 'Building — blocked at retest',
    // A monotonic uptrend: breaks a level but never pulls back to hold the retest → wait@retest.
    ctx: { m5: trendSeries('up', 6), m15: trendSeries('up', 6), h1: trendSeries('up', 6) },
  },
  {
    id: 'demo-wait',
    label: 'WAIT — H1 bias unclear',
    // A flat range → H1 direction unclear → wait@h1-m15-bias (the live-like empty state).
    ctx: { m5: rangeSeries(), m15: rangeSeries(), h1: rangeSeries() },
  },
]
