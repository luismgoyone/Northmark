import { VETO_CATALOGUE } from '../scoring/vetoes'

/**
 * Presentation-only display names. Pure data, no I/O. Kept out of the .tsx
 * component files so React-Refresh sees only components there.
 *
 * The engine's `GateResult` carries an `id`, not a human name — the checklist
 * sequence and its wording are a UI concern, so they live here. App builds its
 * `GateResult[]` from `PHASE1_GATES` and passes the SAME array to both the
 * Checklist rows and the Score confirmation meter (one source of truth).
 */
export type GateDef = { id: string; name: string }

/**
 * The 10 checklist gates in process order (bias → structure → break → retest →
 * confirm → risk), matching docs/ui-spec.md §2 and the source checklist.
 */
export const PHASE1_GATES: GateDef[] = [
  { id: 'h1-m15-bias', name: 'H1 / M15 bias' },
  { id: 'market-structure', name: 'Market structure (HH/HL)' },
  { id: 'consolidation', name: 'Consolidation before break' },
  { id: 'level-id', name: 'Resistance level identified' },
  { id: 'breakout-close', name: 'Breakout close (not wick)' },
  { id: 'retest', name: 'Retest of level' },
  { id: 'confirmation', name: 'Confirmation candle' },
  { id: 'ema9', name: 'Price above rising EMA9' },
  { id: 'stochastic', name: 'Stochastic turning up' },
  { id: 'risk-reward', name: 'Reward : Risk ≥ 1.5' },
]

const GATE_NAME = new Map(PHASE1_GATES.map((g) => [g.id, g.name]))

/** Friendly checklist name for a gate id; falls back to the raw id. */
export function gateName(id: string): string {
  return GATE_NAME.get(id) ?? id
}

const VETO_NAME = new Map(VETO_CATALOGUE.map((v) => [v.id, v.label]))

/** Friendly veto name for a veto id (from the engine catalogue); falls back to the id. */
export function vetoName(id: string): string {
  return VETO_NAME.get(id) ?? id
}
