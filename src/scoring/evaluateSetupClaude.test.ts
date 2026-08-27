import { describe, expect, it } from 'vitest'
import { evaluateSetupClaude } from './evaluateSetupClaude'
import { defaultConfig } from '../config'
import { DEMO_PRESETS } from '../demo/presets'
import type { NewsEvent } from '../edge/newsWindow'

// `demo-setup` authorizes a LONG setup in the base engine; `demo-wait` sits at wait@h1-m15-bias.
const authorizing = DEMO_PRESETS.find((p) => p.id === 'demo-setup') ?? DEMO_PRESETS[0]!
const primeInstant = new Date('2026-07-01T14:00:00Z').getTime() // London–NY overlap

describe('evaluateSetupClaude', () => {
  it('waits when the base structural pipeline is not authorized', () => {
    const ranging = DEMO_PRESETS.find((p) => p.id === 'demo-wait') ?? DEMO_PRESETS[0]!
    const v = evaluateSetupClaude(ranging.ctx, ranging.config ?? defaultConfig, primeInstant, [])
    expect(v.status).toBe('wait')
    expect(v.setup).toBeNull()
    expect(v.tradeable).toBe(false)
  })

  it('grades an authorized setup and reports session', () => {
    const v = evaluateSetupClaude(authorizing.ctx, authorizing.config ?? defaultConfig, primeInstant, [])
    expect(['graded', 'blocked']).toContain(v.status)
    expect(v.session.quality).toBe('prime')
    expect(v.score).not.toBeNull()
    if (v.status === 'graded') expect(v.setup).not.toBeNull()
  })

  it('blocks an authorized setup during a news blackout', () => {
    const events: NewsEvent[] = [{ time: primeInstant, impact: 'high', currency: 'USD', title: 'FOMC' }]
    const v = evaluateSetupClaude(authorizing.ctx, authorizing.config ?? defaultConfig, primeInstant, events)
    expect(v.setup).not.toBeNull()
    if (v.setup) {
      expect(v.status).toBe('blocked')
      expect(v.blockedBy).toBe('news')
      expect(v.tradeable).toBe(false)
    }
  })
})
