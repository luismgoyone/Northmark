// executor/classify.test.ts
import { describe, expect, it } from 'vitest'
import { classify } from './classify'
import { ExecError } from './errors'
import type { Signal } from './types'

const sig = (prev: string, cur: string): Signal => ({
  eventId: 'e', timestamp: 't', symbol: 'XAUUSD', action: null,
  marketPosition: cur as Signal['marketPosition'], prevMarketPosition: prev as Signal['prevMarketPosition'],
})

describe('classify', () => {
  it('flat→long = LONG_ENTRY', () => expect(classify(sig('flat', 'long'))).toEqual([{ type: 'LONG_ENTRY', direction: 'long', isEntry: true }]))
  it('flat→short = SHORT_ENTRY', () => expect(classify(sig('flat', 'short'))[0]!.type).toBe('SHORT_ENTRY'))
  it('long→flat = LONG_EXIT', () => expect(classify(sig('long', 'flat'))[0]!.type).toBe('LONG_EXIT'))
  it('short→flat = SHORT_EXIT', () => expect(classify(sig('short', 'flat'))[0]!.type).toBe('SHORT_EXIT'))
  it('long→short = reversal [LONG_EXIT, SHORT_ENTRY]', () => expect(classify(sig('long', 'short')).map((e) => e.type)).toEqual(['LONG_EXIT', 'SHORT_ENTRY']))
  it('short→long = reversal [SHORT_EXIT, LONG_ENTRY]', () => expect(classify(sig('short', 'long')).map((e) => e.type)).toEqual(['SHORT_EXIT', 'LONG_ENTRY']))
  it('same state (long→long) throws SIGNAL', () => expect(() => classify(sig('long', 'long'))).toThrow(ExecError))
  it('flat→flat throws SIGNAL', () => expect(() => classify(sig('flat', 'flat'))).toThrow(ExecError))
})
