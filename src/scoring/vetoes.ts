import type { Config, GateResult, MarketContext } from '../types'

// Pure module, no I/O. Import direction is downward only (types).
//
// The NO-TRADE veto catalogue — the complete, verbatim enumeration of the 18
// conditions in docs/checklist.md ("The AI must be allowed to say: WAIT").
// Gates map 1:1 to the checklist. A triggered veto is a HARD block.
//
// Convention (must match score.ts, which forces WAIT on any veto with status
// 'fail'):
//   - triggered NO-TRADE condition   → status 'fail' (hard block)
//   - evaluated & NOT triggered       → status 'pass'
//   - deferred / not-evaluable-yet    → status 'wait', detail "deferred: <availability> — <reason>"
//
// Phase 1 reality: NONE of these 18 can be honestly evaluated at this signature.
// Most need heuristic gates not yet built (phase-2), data the local MVP cannot
// see (phase-3), or a candidate setup (entry/sl/tp) not assembled here yet
// (phase-1-wiring). So every veto is DEFERRED: returned as 'wait' with a
// deferral detail. Emitting 'pass' would falsely read as "cleared" — that is a
// false green on a real-money block, so we bias to WAIT.

/** When a veto becomes evaluable. Drives the deferral reason in Phase 1. */
export type VetoAvailability = 'phase-1-wiring' | 'phase-2' | 'phase-3'

export type VetoSpec = { id: string; label: string; availability: VetoAvailability }

/**
 * Complete enumerated catalogue of the 18 NO-TRADE veto conditions, verbatim
 * from docs/checklist.md. `label` is the exact checklist wording (with the Luis
 * 2026-08-14 correction: "EMA20 strongly disagrees" means EMA9). `availability`
 * tags when the condition can first be honestly evaluated:
 *   - phase-1-wiring: logic exists but needs a candidate setup (entry/sl/tp) wired in.
 *   - phase-2:        needs a heuristic gate (structure / consolidation / retest / …).
 *   - phase-3:        needs data the local MVP cannot see (spread / news / session P&L).
 */
export const VETO_CATALOGUE: VetoSpec[] = [
  { id: 'consolidating', label: 'Market is consolidating', availability: 'phase-2' },
  { id: 'mid-range', label: 'Price is in the middle of a range', availability: 'phase-2' },
  { id: 'h1-bias-unclear', label: 'H1 direction is unclear', availability: 'phase-2' },
  { id: 'no-meaningful-sr', label: 'No meaningful S/R exists', availability: 'phase-2' },
  { id: 'breakout-unconfirmed', label: 'Breakout has not been confirmed', availability: 'phase-1-wiring' },
  { id: 'retest-missing', label: "Retest hasn't occurred for the primary setup", availability: 'phase-2' },
  { id: 'weak-confirmation', label: 'Confirmation is weak', availability: 'phase-2' },
  // Checklist says "EMA20 strongly disagrees"; per Luis 2026-08-14 that is a typo — it means EMA9.
  { id: 'ema9-disagrees', label: 'EMA9 strongly disagrees', availability: 'phase-2' },
  { id: 'rr-insufficient', label: 'Risk/reward is insufficient', availability: 'phase-1-wiring' },
  { id: 'tp-too-close', label: 'TP is too close', availability: 'phase-1-wiring' },
  { id: 'sl-illogical', label: 'SL cannot logically be placed', availability: 'phase-2' },
  { id: 'price-extended', label: 'Price is excessively extended', availability: 'phase-2' },
  { id: 'spread-abnormal', label: 'Spread is abnormal', availability: 'phase-3' },
  { id: 'volatility-abnormal', label: 'Volatility is abnormal', availability: 'phase-2' },
  { id: 'news-filter', label: 'Major news filter prohibits trading', availability: 'phase-3' },
  { id: 'daily-loss-limit', label: 'Daily loss limit reached', availability: 'phase-3' },
  { id: 'consecutive-loss-limit', label: 'Consecutive-loss limit reached', availability: 'phase-3' },
  { id: 'entry-chasing', label: 'Entry would be chasing', availability: 'phase-2' },
]

/** Human-readable reason each availability class is not yet evaluable in Phase 1. */
const DEFERRAL_REASON: Record<VetoAvailability, string> = {
  'phase-1-wiring':
    'needs a candidate setup (entry/sl/tp) wired in; not assembled at this signature yet',
  'phase-2': 'needs a heuristic gate not yet built',
  'phase-3': 'needs data the local MVP cannot see yet',
}

/**
 * Evaluate the NO-TRADE vetoes for the current market context.
 *
 * Returns one `GateResult` per catalogue entry (1:1, in catalogue order). In
 * Phase 1 every veto is DEFERRED — status 'wait' with a "deferred: …" detail —
 * because none can be honestly evaluated yet. No result is 'pass' (which would
 * falsely read as "cleared") and none is 'fail'. The enumeration is complete so
 * the catalogue is never silently short a condition.
 *
 * `ctx` and `config` are accepted to lock the signature that later phases fill
 * in; Phase 1 does not read the candle arrays (nothing to evaluate).
 */
export function vetoes(_ctx: MarketContext, _config: Config): GateResult[] {
  return VETO_CATALOGUE.map((spec) => ({
    id: spec.id,
    status: 'wait',
    detail: `deferred: ${spec.availability} — ${DEFERRAL_REASON[spec.availability]} (${spec.label}).`,
  }))
}
