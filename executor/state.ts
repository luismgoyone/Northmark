// executor/state.ts
import type { PositionState, SignalEvent } from './types.js'
import { ExecError } from './errors.js'

/** Advance the FLAT/LONG/SHORT machine. No pyramiding; exits must match the open direction. */
export function applyEvent(state: PositionState, event: SignalEvent): PositionState {
  if (event.isEntry) {
    if (state !== 'FLAT') throw new ExecError('POSITION', `cannot open ${event.direction}: already ${state} (no pyramiding)`)
    return event.direction === 'long' ? 'LONG' : 'SHORT'
  }
  // exit
  const need: PositionState = event.direction === 'long' ? 'LONG' : 'SHORT'
  if (state !== need) throw new ExecError('POSITION', `cannot ${event.type}: position is ${state}`)
  return 'FLAT'
}
