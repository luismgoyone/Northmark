import { describe, expect, it } from 'vitest'
import { evaluateSetup } from '../scoring/evaluateSetup'
import { defaultConfig } from '../config'
import { DEMO_PRESETS } from './presets'

const byId = (id: string) => DEMO_PRESETS.find((p) => p.id === id)!

describe('DEMO_PRESETS drive the engine to their intended verdicts', () => {
  it('demo-setup → an authorized LONG setup', () => {
    const v = evaluateSetup(byId('demo-setup').ctx, defaultConfig)
    expect(v.status).toBe('setup')
    if (v.status === 'setup') {
      expect(v.direction).toBe('long')
      expect(v.score.authorized).toBe(true)
      expect(v.lot).toBeGreaterThan(0)
    }
  })
  it('demo-building → WAIT blocked at retest', () => {
    const v = evaluateSetup(byId('demo-building').ctx, defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') expect(v.blockedBy).toBe('retest')
  })
  it('demo-wait → WAIT blocked at h1-m15-bias', () => {
    const v = evaluateSetup(byId('demo-wait').ctx, defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') expect(v.blockedBy).toBe('h1-m15-bias')
  })
  it('exposes exactly the three presets with stable ids', () => {
    expect(DEMO_PRESETS.map((p) => p.id)).toEqual(['demo-setup', 'demo-building', 'demo-wait'])
  })
})
