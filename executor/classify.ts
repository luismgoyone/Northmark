// executor/classify.ts
import type { Signal, SignalEvent } from './types.js'
import { ExecError } from './errors.js'

const LONG_ENTRY: SignalEvent = { type: 'LONG_ENTRY', direction: 'long', isEntry: true }
const SHORT_ENTRY: SignalEvent = { type: 'SHORT_ENTRY', direction: 'short', isEntry: true }
const LONG_EXIT: SignalEvent = { type: 'LONG_EXIT', direction: 'long', isEntry: false }
const SHORT_EXIT: SignalEvent = { type: 'SHORT_EXIT', direction: 'short', isEntry: false }

/** Classify by the marketPosition transition. Reversal → [exit, entry]. Throws SIGNAL on no-op/ambiguous. */
export function classify(s: Signal): SignalEvent[] {
  const key = `${s.prevMarketPosition}->${s.marketPosition}`
  switch (key) {
    case 'flat->long': return [LONG_ENTRY]
    case 'flat->short': return [SHORT_ENTRY]
    case 'long->flat': return [LONG_EXIT]
    case 'short->flat': return [SHORT_EXIT]
    case 'long->short': return [LONG_EXIT, SHORT_ENTRY]
    case 'short->long': return [SHORT_EXIT, LONG_ENTRY]
    default:
      throw new ExecError('SIGNAL', `ambiguous/no-op transition: ${key}`)
  }
}
