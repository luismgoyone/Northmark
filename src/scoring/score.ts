import type { GateResult } from '../types.js'

// Pure module, no I/O. Import direction is downward only (types).
//
// The band is DISPLAY conviction, derived from authorization + supporting agreement
// (2026-08-20 reframe). It is NOT a raw pass tally, and it is never 'strong'/'building'
// unless the setup is authorized. `passed` still reports the hard-gate tally for the meter.

export type ScoreBand = 'wait' | 'building' | 'strong'

export type Score = { passed: number; band: ScoreBand; authorized: boolean }

/**
 * Score a setup into a confidence band.
 *
 * `passed` counts hard gates with status 'pass' (for the meter/count only).
 *
 * `authorized` is caller-asserted, demoted to false whenever any veto fires
 * (status 'fail'). score() never claims authorization on its own.
 *
 * Band:
 *   - not authorized (or a veto fired) → 'wait'
 *   - authorized AND every supporting result passes → 'strong'
 *   - authorized AND some/no supporting agreement    → 'building'
 * Supporting checks NEVER block — they only raise/lower conviction here.
 */
export function score(
  gateResults: GateResult[],
  vetoes: GateResult[] = [],
  authorized = false,
  supporting: GateResult[] = [],
): Score {
  const passed = gateResults.filter((g) => g.status === 'pass').length
  const vetoed = vetoes.some((v) => v.status === 'fail')
  const auth = authorized && !vetoed

  let band: ScoreBand
  if (!auth) {
    band = 'wait'
  } else if (supporting.length > 0 && supporting.every((s) => s.status === 'pass')) {
    band = 'strong'
  } else {
    band = 'building'
  }

  return { passed, band, authorized: auth }
}
