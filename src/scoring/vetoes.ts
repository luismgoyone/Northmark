import type { Config, GateResult } from '../types'

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
//   - not independently evaluable yet → status 'wait', with an honest detail
//
// Phase 2 reality: 7 of the 18 conditions are a direct PROJECTION of the
// ordered 8-gate required sequence evaluateSetup already computes (bias,
// structure, consolidation, level-id, breakout-close, retest, confirmation,
// risk-reward) — see WIRED_VETOES below. The remaining 11 are still not
// independently evaluable: 4 need live broker/session data this local MVP
// cannot see (phase-3), and 7 need heuristic gates or setup data not yet
// wired (phase-2 / phase-1-wiring). Those 11 stay 'wait'. Emitting 'pass' for
// something not actually checked would falsely read as "cleared" — a false
// green on a real-money block — so we bias to WAIT.

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

/**
 * The 7 wired vetoes: each is a direct PROJECTION of one gate in the ordered
 * 8-gate required sequence (checklist steps 1-9 & 14, `evaluateSetup`'s
 * `ORDER`). Maps veto id → the gate id it derives its status from.
 */
const WIRED_VETOES: Record<string, string> = {
  'h1-bias-unclear': 'h1-m15-bias',
  consolidating: 'consolidation',
  'no-meaningful-sr': 'level-id',
  'breakout-unconfirmed': 'breakout-close',
  'retest-missing': 'retest',
  'weak-confirmation': 'confirmation',
  'rr-insufficient': 'risk-reward',
}

/** The 4 deferred vetoes that need live broker/session data this local MVP cannot see (phase-3). */
const EXTERNAL_DATA_VETOES = new Set([
  'spread-abnormal',
  'news-filter',
  'daily-loss-limit',
  'consecutive-loss-limit',
])

const EXTERNAL_DATA_DETAIL = 'Needs live broker/session data (not available locally).'
const NOT_WIRED_DETAIL =
  'Not independently wired yet — the required-gate checklist covers the current setup state.'

/**
 * Detail string for a FIRED ('fail') wired veto. Usually the catalogue label, but
 * `h1-bias-unclear` needs a special case: `bias.ts` returns the `h1-m15-bias` gate as
 * not-pass for TWO distinct reasons — unclear H1 structure OR EMA9 strongly disagreeing —
 * so claiming specifically "H1 direction is unclear" would be factually wrong in the EMA9
 * case (and the dedicated `ema9-disagrees` veto stays deferred). Distinguishing them
 * cleanly would require changing bias.ts (out of scope), so we soften the fired detail to
 * be accurate for both. The catalogue id/label are unchanged.
 */
function firedDetail(spec: VetoSpec): string {
  if (spec.id === 'h1-bias-unclear') {
    return 'H1 bias not confirmed — unclear structure or EMA9 disagreement.'
  }
  return `${spec.label} is the active no-trade condition.`
}

/**
 * Evaluate the NO-TRADE vetoes as a projection of the ordered 8-gate required
 * sequence (`gates`, in checklist step order: h1-m15-bias, market-structure,
 * consolidation, level-id, breakout-close, retest, confirmation, risk-reward
 * — the exact array `evaluateSetup` builds).
 *
 * Returns one `GateResult` per catalogue entry (1:1, in catalogue order).
 *
 * For the 7 WIRED vetoes (see `WIRED_VETOES`), each derives its status from
 * its mapped gate's position relative to the first non-'pass' gate
 * (`blockIdx`, or -1 when every gate passed — an authorized setup):
 *   - blockIdx === -1, or the mapped gate's index < blockIdx (it already
 *     passed)              → 'pass' (cleared)
 *   - the mapped gate IS the active blocker (index === blockIdx)
 *                           → 'fail' (triggered NO-TRADE condition)
 *   - the mapped gate has not been reached yet (index > blockIdx)
 *                           → 'wait' (monitoring)
 *
 * The remaining 11 vetoes are not independently evaluable yet and always
 * return 'wait' — never 'fail' — with an honest reason: the 4 external-data
 * conditions need live broker/session data; the other 7 are not yet wired to
 * their own check (the required-gate sequence covers the current setup
 * state in the meantime). Emitting 'pass' for something not actually
 * checked would falsely read as "cleared" — a false green on a real-money
 * block — so these stay WAIT, never PASS or FAIL.
 */
export function vetoes(gates: GateResult[], _config: Config): GateResult[] {
  const blockIdx = gates.findIndex((g) => g.status !== 'pass')

  return VETO_CATALOGUE.map((spec) => {
    const gateId = WIRED_VETOES[spec.id]
    if (gateId !== undefined) {
      const gi = gates.findIndex((g) => g.id === gateId)
      // No-false-clear guard: if the mapped gate id doesn't match anything in the
      // array (typo / refactor / short array), `gi` is -1 and `-1 < blockIdx` would
      // silently mark this veto 'pass' — a false clear on a real-money block, the one
      // thing we must never emit. Bias to WAIT instead, never 'pass'/'fail'.
      if (gi === -1) {
        return {
          id: spec.id,
          status: 'wait',
          detail: `Unmapped gate "${gateId}" — not evaluated.`,
        }
      }
      if (blockIdx === -1 || gi < blockIdx) {
        return { id: spec.id, status: 'pass', detail: `Cleared: ${gateId} passed.` }
      }
      if (gi === blockIdx) {
        return { id: spec.id, status: 'fail', detail: firedDetail(spec) }
      }
      return {
        id: spec.id,
        status: 'wait',
        detail: 'Monitoring — an earlier required gate is still unresolved.',
      }
    }

    const detail = EXTERNAL_DATA_VETOES.has(spec.id) ? EXTERNAL_DATA_DETAIL : NOT_WIRED_DETAIL
    return { id: spec.id, status: 'wait', detail }
  })
}
