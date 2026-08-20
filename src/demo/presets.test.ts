import { describe, expect, it } from 'vitest'
import { evaluateSetup } from '../scoring/evaluateSetup'
import { defaultConfig } from '../config'
import { toCandlePoints } from '../ui/chartData'
import { DEMO_PRESETS } from './presets'

const byId = (id: string) => DEMO_PRESETS.find((p) => p.id === id)!

describe('DEMO_PRESETS drive the engine to their intended verdicts', () => {
  it('demo-setup → an authorized LONG setup with a STRONG band (both supporting pass)', () => {
    const v = evaluateSetup(byId('demo-setup').ctx, defaultConfig)
    expect(v.status).toBe('setup')
    if (v.status === 'setup') {
      expect(v.direction).toBe('long')
      expect(v.score.authorized).toBe(true)
      expect(v.score.band).toBe('strong')
      expect(v.supporting.every((s) => s.status === 'pass')).toBe(true)
      expect(v.lot).toBeGreaterThan(0)
    }
  })
  it('demo-setup carries a config sized for a legible lot (~0.20, not ~0.004)', () => {
    const demoSetup = byId('demo-setup')
    const v = evaluateSetup(demoSetup.ctx, demoSetup.config!)
    expect(v.status).toBe('setup')
    if (v.status === 'setup') expect(v.lot).toBeCloseTo(0.2, 2)
  })
  it('demo-building → authorized LONG with a BUILDING band (M15 structure withheld, EMA9 passes)', () => {
    const preset = byId('demo-building')
    const v = evaluateSetup(preset.ctx, preset.config ?? defaultConfig)
    expect(v.status).toBe('setup')
    if (v.status === 'setup') {
      expect(v.direction).toBe('long')
      expect(v.score.authorized).toBe(true)
      expect(v.score.band).toBe('building')
      // BUILDING (not STRONG) because exactly one supporting check is withheld: M15 structure.
      expect(v.supporting.find((s) => s.id === 'market-structure')?.status).not.toBe('pass')
      expect(v.supporting.find((s) => s.id === 'ema9-alignment')?.status).toBe('pass')
    }
  })
  it('demo-wait → WAIT blocked at h1-m15-bias', () => {
    const v = evaluateSetup(byId('demo-wait').ctx, defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') expect(v.blockedBy).toBe('h1-m15-bias')
  })
  it('exposes exactly the three presets with stable ids', () => {
    expect(DEMO_PRESETS.map((p) => p.id)).toEqual(['demo-setup', 'demo-building', 'demo-wait'])
  })
  it('every preset/timeframe converts to strictly ascending, non-zero chart times (the chart-crash regression)', () => {
    // Before `withTimes`, presets used small-integer time (0, 1, 2…) which `chartData.ts`'s
    // ms→seconds floor collapsed to 0 for every bar — a real crash surface for lightweight-charts,
    // which requires strictly ascending, unique times. Exercise the real (unmocked) conversion.
    for (const preset of DEMO_PRESETS) {
      for (const tf of ['m5', 'm15', 'h1'] as const) {
        const points = toCandlePoints(preset.ctx[tf])
        const times = points.map((p) => p.time)
        expect(times[0]).toBeGreaterThan(0)
        for (let i = 1; i < times.length; i++) {
          expect(times[i]).toBeGreaterThan(times[i - 1]!)
        }
      }
    }
  })
})
