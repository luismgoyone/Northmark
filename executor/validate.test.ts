// executor/validate.test.ts
import { describe, expect, it } from 'vitest'
import { validateEntry, symbolFor } from './validate'
import { ExecError } from './errors'
import type { Signal, SignalEvent } from './types'

const LE: SignalEvent = { type: 'LONG_ENTRY', direction: 'long', isEntry: true }
const SE: SignalEvent = { type: 'SHORT_ENTRY', direction: 'short', isEntry: true }
const s = (o: Partial<Signal>): Signal => ({ eventId: 'e', timestamp: 't', symbol: 'XAUUSD', action: null, marketPosition: 'flat', prevMarketPosition: 'flat', ...o })

describe('validateEntry', () => {
  it('accepts a well-formed long (sl<entry<tp) and maps the symbol', () => {
    const o = validateEntry(LE, s({ entry: 100, sl: 99, tp: 101.2, lot: 0.01 }))
    expect(o).toEqual({ symbol: symbolFor('XAUUSD'), direction: 'long', entry: 100, sl: 99, tp: 101.2, lot: 0.01 })
  })
  it('accepts a well-formed short (tp<entry<sl)', () => {
    expect(validateEntry(SE, s({ entry: 100, sl: 101, tp: 98.8, lot: 0.01 })).direction).toBe('short')
  })
  it('throws RISK when SL/TP are missing', () => expect(() => validateEntry(LE, s({ entry: 100, lot: 0.01 }))).toThrow(/RISK|sl|tp/i))
  it('throws RISK on wrong-side SL for a long', () => expect(() => validateEntry(LE, s({ entry: 100, sl: 101, tp: 102, lot: 0.01 }))).toThrow(ExecError))
  it('throws LOT on non-positive lot', () => expect(() => validateEntry(LE, s({ entry: 100, sl: 99, tp: 101, lot: 0 }))).toThrow(ExecError))
})
