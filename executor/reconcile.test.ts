// executor/reconcile.test.ts
import { describe, expect, it } from 'vitest'
import { reconcile, type BrokerPosition } from './reconcile'

const long: BrokerPosition = { symbol: 'XAUUSDm', direction: 'long', volume: 0.01 }
const short: BrokerPosition = { symbol: 'XAUUSDm', direction: 'short', volume: 0.01 }

describe('reconcile', () => {
  it('FLAT + no positions = in sync', () => expect(reconcile('FLAT', []).inSync).toBe(true))
  it('LONG + one long = in sync', () => expect(reconcile('LONG', [long]).inSync).toBe(true))
  it('LONG + no positions = drift bot_has_no_broker_position', () => {
    const r = reconcile('LONG', [])
    expect(r.inSync).toBe(false); expect(r.drift[0]?.kind).toBe('bot_has_no_broker_position')
  })
  it('FLAT + a position = drift broker_has_unexpected_position', () => {
    expect(reconcile('FLAT', [long]).drift[0]?.kind).toBe('broker_has_unexpected_position')
  })
  it('LONG + a short = direction_mismatch', () => {
    expect(reconcile('LONG', [short]).drift.some((d) => d.kind === 'direction_mismatch')).toBe(true)
  })
  it('any state + 2 positions = multiple_broker_positions', () => {
    expect(reconcile('LONG', [long, long]).drift.some((d) => d.kind === 'multiple_broker_positions')).toBe(true)
  })
})
