// executor/state.test.ts
import { describe, expect, it } from 'vitest'
import { applyEvent } from './state'
import { ExecError } from './errors'
import type { SignalEvent } from './types'

const E = {
  LE: { type: 'LONG_ENTRY', direction: 'long', isEntry: true } as SignalEvent,
  SE: { type: 'SHORT_ENTRY', direction: 'short', isEntry: true } as SignalEvent,
  LX: { type: 'LONG_EXIT', direction: 'long', isEntry: false } as SignalEvent,
  SX: { type: 'SHORT_EXIT', direction: 'short', isEntry: false } as SignalEvent,
}
describe('applyEvent', () => {
  it('FLAT + LONG_ENTRY → LONG', () => expect(applyEvent('FLAT', E.LE)).toBe('LONG'))
  it('FLAT + SHORT_ENTRY → SHORT', () => expect(applyEvent('FLAT', E.SE)).toBe('SHORT'))
  it('LONG + LONG_EXIT → FLAT', () => expect(applyEvent('LONG', E.LX)).toBe('FLAT'))
  it('SHORT + SHORT_EXIT → FLAT', () => expect(applyEvent('SHORT', E.SX)).toBe('FLAT'))
  it('rejects pyramiding: LONG + LONG_ENTRY', () => expect(() => applyEvent('LONG', E.LE)).toThrow(ExecError))
  it('rejects exit with no position: FLAT + LONG_EXIT', () => expect(() => applyEvent('FLAT', E.LX)).toThrow(ExecError))
  it('rejects wrong-direction exit: LONG + SHORT_EXIT', () => expect(() => applyEvent('LONG', E.SX)).toThrow(ExecError))
})
