import { describe, expect, it } from 'vitest'
import type { GateResult } from '../types'
import { vetoes, VETO_CATALOGUE } from './vetoes'
import { defaultConfig } from '../config'

const config = defaultConfig

// The 18 NO-TRADE veto conditions, verbatim from docs/checklist.md.
// NOTE the checklist correction: "EMA20 strongly disagrees" means EMA9.
const EXPECTED_LABELS: Record<string, string> = {
  consolidating: 'Market is consolidating',
  'mid-range': 'Price is in the middle of a range',
  'h1-bias-unclear': 'H1 direction is unclear',
  'no-meaningful-sr': 'No meaningful S/R exists',
  'breakout-unconfirmed': 'Breakout has not been confirmed',
  'retest-missing': "Retest hasn't occurred for the primary setup",
  'weak-confirmation': 'Confirmation is weak',
  'ema9-disagrees': 'EMA9 strongly disagrees',
  'rr-insufficient': 'Risk/reward is insufficient',
  'tp-too-close': 'TP is too close',
  'sl-illogical': 'SL cannot logically be placed',
  'price-extended': 'Price is excessively extended',
  'spread-abnormal': 'Spread is abnormal',
  'volatility-abnormal': 'Volatility is abnormal',
  'news-filter': 'Major news filter prohibits trading',
  'daily-loss-limit': 'Daily loss limit reached',
  'consecutive-loss-limit': 'Consecutive-loss limit reached',
  'entry-chasing': 'Entry would be chasing',
}

describe('VETO_CATALOGUE', () => {
  it('(a) enumerates exactly the 18 NO-TRADE conditions', () => {
    expect(VETO_CATALOGUE).toHaveLength(18)
  })

  it('(a) has unique ids', () => {
    const ids = VETO_CATALOGUE.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('(b) every label matches docs/checklist.md wording verbatim', () => {
    for (const spec of VETO_CATALOGUE) {
      expect(spec.label).toBe(EXPECTED_LABELS[spec.id])
    }
  })

  it('(b) spot-check: ema9-disagrees uses the EMA9 correction, not EMA20', () => {
    const spec = VETO_CATALOGUE.find((v) => v.id === 'ema9-disagrees')
    expect(spec?.label).toBe('EMA9 strongly disagrees')
  })

  it('(b) spot-check: breakout-unconfirmed and consolidating wording', () => {
    expect(VETO_CATALOGUE.find((v) => v.id === 'breakout-unconfirmed')?.label).toBe(
      'Breakout has not been confirmed',
    )
    expect(VETO_CATALOGUE.find((v) => v.id === 'consolidating')?.label).toBe(
      'Market is consolidating',
    )
  })

  it('every entry has a known availability tag', () => {
    const tags = new Set(['phase-1-wiring', 'phase-2', 'phase-3'])
    for (const spec of VETO_CATALOGUE) {
      expect(tags.has(spec.availability)).toBe(true)
    }
  })
})

// The ordered 8-gate sequence evaluateSetup builds, per checklist steps 1-9 & 14.
const GATE_ORDER = [
  'h1-m15-bias',
  'consolidation',
  'level-id',
  'breakout-close',
  'retest',
  'confirmation',
  'risk-reward',
] as const

// The 7 wired vetoes and the gate id each projects from.
const WIRED = {
  'h1-bias-unclear': 'h1-m15-bias',
  consolidating: 'consolidation',
  'no-meaningful-sr': 'level-id',
  'breakout-unconfirmed': 'breakout-close',
  'retest-missing': 'retest',
  'weak-confirmation': 'confirmation',
  'rr-insufficient': 'risk-reward',
} as const

const DEFERRED_IDS = VETO_CATALOGUE.map((v) => v.id).filter(
  (id) => !(id in WIRED),
)

/** Build a full ordered 8-gate array, all 'pass' except overrides. */
function gatesWith(overrides: Partial<Record<(typeof GATE_ORDER)[number], GateResult['status']>>): GateResult[] {
  return GATE_ORDER.map((id) => ({
    id,
    status: overrides[id] ?? 'pass',
    detail: `stub for ${id}`,
  }))
}

function statusById(results: GateResult[]): Map<string, GateResult['status']> {
  return new Map(results.map((r) => [r.id, r.status]))
}

describe('vetoes()', () => {
  it('returns one GateResult per catalogue entry (18), in catalogue order', () => {
    const results = vetoes(gatesWith({}), config)
    expect(results).toHaveLength(18)
    expect(results.map((r) => r.id)).toEqual(VETO_CATALOGUE.map((v) => v.id))
  })

  it('all gates pass → all 7 wired vetoes pass, 11 deferred wait, 0 fail', () => {
    const results = vetoes(gatesWith({}), config)
    const byId = statusById(results)

    for (const vetoId of Object.keys(WIRED)) {
      expect(byId.get(vetoId)).toBe('pass')
    }
    for (const vetoId of DEFERRED_IDS) {
      expect(byId.get(vetoId)).toBe('wait')
    }
    expect(results.filter((r) => r.status === 'fail')).toHaveLength(0)
  })

  it('bias is the blocker → h1-bias-unclear fails, the other 6 wired vetoes wait (not reached), deferred wait', () => {
    const gates = gatesWith({
      'h1-m15-bias': 'wait',
      consolidation: 'wait',
      'level-id': 'wait',
      'breakout-close': 'wait',
      retest: 'wait',
      confirmation: 'wait',
      'risk-reward': 'wait',
    })
    const results = vetoes(gates, config)
    const byId = statusById(results)

    expect(byId.get('h1-bias-unclear')).toBe('fail')
    for (const vetoId of Object.keys(WIRED)) {
      if (vetoId === 'h1-bias-unclear') continue
      expect(byId.get(vetoId)).toBe('wait')
    }
    for (const vetoId of DEFERRED_IDS) {
      expect(byId.get(vetoId)).toBe('wait')
    }
    expect(results.filter((r) => r.status === 'fail')).toHaveLength(1)
  })

  it('fired h1-bias-unclear detail names the (now sole) unclear-structure cause', () => {
    const results = vetoes(gatesWith({ 'h1-m15-bias': 'fail' }), config)
    const fired = results.find((r) => r.id === 'h1-bias-unclear')!
    expect(fired.status).toBe('fail')
    expect(fired.detail).toBe('H1 direction is unclear — no clean HH/HL or LH/LL.')
  })

  it('no-false-clear guard: an unmatched gate id yields wait, never a false pass', () => {
    // A truncated gate array (missing risk-reward) means rr-insufficient's mapped gate id
    // matches nothing → gi === -1. It must NOT silently clear to 'pass'.
    const truncated: GateResult[] = GATE_ORDER.slice(0, 6).map((id) => ({
      id,
      status: 'pass',
      detail: `stub for ${id}`,
    }))
    const results = vetoes(truncated, config)
    const rr = results.find((r) => r.id === 'rr-insufficient')!
    expect(rr.status).toBe('wait')
    expect(rr.detail).toContain('Unmapped gate')
    // Still one result per catalogue entry, in order.
    expect(results.map((r) => r.id)).toEqual(VETO_CATALOGUE.map((v) => v.id))
  })

  it('risk-reward is the blocker → rr-insufficient fails, the other 6 wired vetoes are cleared (pass), deferred wait', () => {
    const gates = gatesWith({ 'risk-reward': 'fail' })
    const results = vetoes(gates, config)
    const byId = statusById(results)

    expect(byId.get('rr-insufficient')).toBe('fail')
    for (const vetoId of Object.keys(WIRED)) {
      if (vetoId === 'rr-insufficient') continue
      expect(byId.get(vetoId)).toBe('pass')
    }
    for (const vetoId of DEFERRED_IDS) {
      expect(byId.get(vetoId)).toBe('wait')
    }
    expect(results.filter((r) => r.status === 'fail')).toHaveLength(1)
  })

  it('consolidation is the blocker → consolidating fails; bias-veto is cleared (bias passed); downstream wired wait', () => {
    const gates = gatesWith({
      consolidation: 'wait',
      'level-id': 'wait',
      'breakout-close': 'wait',
      retest: 'wait',
      confirmation: 'wait',
      'risk-reward': 'wait',
    })
    const results = vetoes(gates, config)
    const byId = statusById(results)

    expect(byId.get('consolidating')).toBe('fail')
    expect(byId.get('h1-bias-unclear')).toBe('pass') // bias gate (index 0) passed, before the blocker
    for (const vetoId of ['no-meaningful-sr', 'breakout-unconfirmed', 'retest-missing', 'weak-confirmation', 'rr-insufficient']) {
      expect(byId.get(vetoId)).toBe('wait')
    }
    for (const vetoId of DEFERRED_IDS) {
      expect(byId.get(vetoId)).toBe('wait')
    }
    expect(results.filter((r) => r.status === 'fail')).toHaveLength(1)
  })

  it('deferred vetoes never return fail, regardless of gate outcomes', () => {
    const scenarios: GateResult[][] = [
      gatesWith({}),
      gatesWith({ 'h1-m15-bias': 'wait' }),
      gatesWith({ 'risk-reward': 'fail' }),
      gatesWith({ consolidation: 'fail' }),
    ]
    for (const gates of scenarios) {
      const results = vetoes(gates, config)
      for (const vetoId of DEFERRED_IDS) {
        const r = results.find((x) => x.id === vetoId)!
        expect(r.status).not.toBe('fail')
      }
    }
  })

  it('deferred external-data vetoes give an honest "needs live broker/session data" detail', () => {
    const results = vetoes(gatesWith({}), config)
    for (const id of ['spread-abnormal', 'news-filter', 'daily-loss-limit', 'consecutive-loss-limit']) {
      const r = results.find((x) => x.id === id)!
      expect(r.detail).toBe('Needs live broker/session data (not available locally).')
    }
  })

  it('deferred non-wired vetoes give an honest "not independently wired yet" detail', () => {
    const results = vetoes(gatesWith({}), config)
    for (const id of ['mid-range', 'ema9-disagrees', 'price-extended', 'entry-chasing', 'volatility-abnormal', 'sl-illogical', 'tp-too-close']) {
      const r = results.find((x) => x.id === id)!
      expect(r.detail).toBe(
        'Not independently wired yet — the required-gate checklist covers the current setup state.',
      )
    }
  })

  it('no deferred detail mentions the stale "Phase 1" wording', () => {
    const results = vetoes(gatesWith({}), config)
    for (const vetoId of DEFERRED_IDS) {
      const r = results.find((x) => x.id === vetoId)!
      expect(r.detail.toLowerCase()).not.toContain('phase 1')
      expect(r.detail).not.toContain('deferred:')
    }
  })
})
