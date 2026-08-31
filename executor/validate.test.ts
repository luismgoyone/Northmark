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
  it('throws LOT on a non-finite lot', () => expect(() => validateEntry(LE, s({ entry: 100, sl: 99, tp: 101, lot: Infinity }))).toThrow(/LOT|lot/i))
  it('throws LOT when lot exceeds the hard cap (default 0.10)', () =>
    expect(() => validateEntry(LE, s({ entry: 100, sl: 99, tp: 101, lot: 5 }))).toThrow(/cap|exceed/i))
  it('accepts a lot exactly at the default cap (0.10)', () =>
    expect(validateEntry(LE, s({ entry: 100, sl: 99, tp: 101, lot: 0.1 })).lot).toBe(0.1))
  it('honors EXEC_MAX_LOT to raise/lower the cap', () => {
    const prev = process.env.EXEC_MAX_LOT
    try {
      process.env.EXEC_MAX_LOT = '0.02'
      expect(() => validateEntry(LE, s({ entry: 100, sl: 99, tp: 101, lot: 0.05 }))).toThrow(/cap|exceed/i)
      expect(validateEntry(LE, s({ entry: 100, sl: 99, tp: 101, lot: 0.02 })).lot).toBe(0.02)
    } finally {
      if (prev === undefined) delete process.env.EXEC_MAX_LOT
      else process.env.EXEC_MAX_LOT = prev
    }
  })
})
