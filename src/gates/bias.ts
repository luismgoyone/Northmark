import type { Direction, GateResult, MarketContext } from '../types.js'
import { structureDirection } from './structure.js'

/**
 * Primary bias: direction from H1 market structure ONLY (2026-08-20 reframe).
 * EMA9 alignment moved to its own supporting gate (`emaAlignment`) so it can never
 * veto a setup. This gate blocks only when H1 structure is unclear.
 */
export function bias(ctx: MarketContext): { result: GateResult; direction: Direction | null } {
  const id = 'h1-m15-bias'
  const direction = structureDirection(ctx.h1)
  if (direction === null) {
    return { result: { id, status: 'wait', detail: 'H1 direction is unclear (no clean HH/HL or LH/LL). No trade.' }, direction: null }
  }
  return { result: { id, status: 'pass', detail: `H1 bias ${direction} from clean structure.` }, direction }
}
