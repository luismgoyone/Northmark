import type { GateResult } from '../types'

// Pure module, no I/O. Import direction is downward only (types).
//
// Tallies passing gates into a confidence band, then applies the veto override.

export type ScoreBand = 'wait' | 'building' | 'strong'

export type Score = { passed: number; band: ScoreBand; authorized: boolean }

// Band thresholds — Tier-2 default, anchored to MVP §4 endpoints
// ("3–4 = WAIT, 8–10 = strong, per the user's rule"):
//   passed <= 4        → 'wait'      (§4 lower endpoint: 4 is still WAIT)
//   passed 5..7        → 'building'  (the gap between the two §4 endpoints)
//   passed >= 8        → 'strong'    (§4 upper endpoint: 8 begins strong)
// The §4 rule fixes the endpoints (4→wait, 8→strong); the 5–7 'building'
// band bridges them. Documented here so the boundary choice is explicit.
const WAIT_MAX = 4
const STRONG_MIN = 8

/**
 * Score a set of gate results into a confidence band.
 *
 * `passed` counts only gates with status 'pass' (fail/wait do not count).
 *
 * Veto override (bias-toward-WAIT): if `vetoes` contains ANY result with
 * status 'fail' — the convention from vetoes.ts for a TRIGGERED NO-TRADE
 * condition (a hard block) — the band is forced to 'wait' regardless of the
 * passed count. `passed` itself is left untouched (it reports the gate tally,
 * not the veto verdict). Vetoes with status 'wait' (deferred) or 'pass'
 * (cleared) do NOT override — in Phase 1 vetoes() returns all 'wait', so the
 * override never triggers yet, but the contract is honored. `vetoes` defaults
 * to empty → no override.
 *
 * `authorized` is DISPLAY-passthrough, not derived from the tally: it is
 * whatever the caller asserts (default `false`), demoted to `false` whenever
 * a veto fires. score() never sets `authorized = true` on its own — only the
 * required-gate sequence (evaluateSetup) may claim it, by explicitly passing
 * `authorized = true` once every required gate has passed.
 */
export function score(gateResults: GateResult[], vetoes: GateResult[] = [], authorized = false): Score {
  const passed = gateResults.filter((g) => g.status === 'pass').length

  let band: ScoreBand
  if (passed <= WAIT_MAX) {
    band = 'wait'
  } else if (passed >= STRONG_MIN) {
    band = 'strong'
  } else {
    band = 'building'
  }

  const vetoed = vetoes.some((v) => v.status === 'fail')
  if (vetoed) {
    band = 'wait'
  }

  return { passed, band, authorized: authorized && !vetoed }
}
