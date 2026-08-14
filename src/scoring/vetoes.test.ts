import { describe, expect, it } from 'vitest'
import type { Candle, Config, MarketContext } from '../types'
import { vetoes, VETO_CATALOGUE } from './vetoes'
import { defaultConfig } from '../config'

// Minimal, valid MarketContext. Vetoes are ALL deferred in Phase 1, so the
// candle contents are irrelevant — empty arrays exercise the real code path.
const emptyCtx: MarketContext = { m5: [], m15: [], h1: [] }
const config: Config = defaultConfig

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

describe('vetoes()', () => {
  it('(c) returns one GateResult per catalogue entry (18)', () => {
    expect(vetoes(emptyCtx, config)).toHaveLength(VETO_CATALOGUE.length)
  })

  it('(c) Phase 1: ALL results are wait — none pass (nothing falsely cleared)', () => {
    for (const r of vetoes(emptyCtx, config)) {
      expect(r.status).toBe('wait')
    }
  })

  it('(c) Phase 1: NONE fail and NONE pass', () => {
    const statuses = vetoes(emptyCtx, config).map((r) => r.status)
    expect(statuses).not.toContain('pass')
    expect(statuses).not.toContain('fail')
  })

  it('(d) every result detail starts with "deferred:"', () => {
    for (const r of vetoes(emptyCtx, config)) {
      expect(r.detail.startsWith('deferred:')).toBe(true)
    }
  })

  it('result ids line up 1:1 with the catalogue ids', () => {
    const resultIds = vetoes(emptyCtx, config).map((r) => r.id)
    const catalogueIds = VETO_CATALOGUE.map((v) => v.id)
    expect(resultIds).toEqual(catalogueIds)
  })

  it('deferral detail names the availability phase', () => {
    const byId = new Map(vetoes(emptyCtx, config).map((r) => [r.id, r]))
    for (const spec of VETO_CATALOGUE) {
      expect(byId.get(spec.id)?.detail).toContain(spec.availability)
    }
  })

  it('does not read from the candle arrays (pure, content-independent)', () => {
    const populated: MarketContext = {
      m5: [{ time: 0, open: 1, high: 2, low: 0.5, close: 1.5 } as Candle],
      m15: [],
      h1: [],
    }
    expect(vetoes(populated, config).map((r) => r.status)).toEqual(
      vetoes(emptyCtx, config).map((r) => r.status),
    )
  })
})
