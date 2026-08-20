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

export const PHASE1_GATES: GateDef[] = [
  { id: 'h1-m15-bias', name: 'H1 bias / direction' },
  { id: 'consolidation', name: 'Consolidation before break' },
  { id: 'level-id', name: 'Resistance level identified' },
  { id: 'breakout-close', name: 'Breakout close (not wick)' },
  { id: 'retest', name: 'Retest of level' },
  { id: 'confirmation', name: 'Confirmation candle' },
  { id: 'risk-reward', name: 'Reward : Risk ≥ 1.5' },
]

/** Supporting confirmations — evaluated but never blocking; shown beside the band. */
export const SUPPORTING_GATES: GateDef[] = [
  { id: 'market-structure', name: 'M15 structure' },
  { id: 'ema9-alignment', name: 'EMA9 alignment' },
]

/** The review's three layers, grouping the 7 hard filters for the checklist. */
export type ChecklistLayer = { title: string; ids: string[] }
export const CHECKLIST_LAYERS: ChecklistLayer[] = [
  { title: 'Market Filter', ids: ['h1-m15-bias', 'consolidation', 'level-id'] },
  { title: 'Setup', ids: ['breakout-close', 'retest'] },
  { title: 'Trigger', ids: ['confirmation', 'risk-reward'] },
]

const GATE_NAME = new Map([...PHASE1_GATES, ...SUPPORTING_GATES].map((g) => [g.id, g.name]))

/** Friendly checklist name for a gate id; falls back to the raw id. */
export function gateName(id: string): string {
  return GATE_NAME.get(id) ?? id
}

const VETO_NAME = new Map(VETO_CATALOGUE.map((v) => [v.id, v.label]))

/** Friendly veto name for a veto id (from the engine catalogue); falls back to the id. */
export function vetoName(id: string): string {
  return VETO_NAME.get(id) ?? id
}
