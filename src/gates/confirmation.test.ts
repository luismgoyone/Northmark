import { describe, expect, it } from 'vitest'
import { confirmation } from './confirmation'
import type { Candle } from '../types'

const bullish: Candle[] = [{ time: 0, open: 1000, high: 1006, low: 999, close: 1005 }]
const doji: Candle[] = [{ time: 0, open: 1000, high: 1006, low: 994, close: 1000.1 }]
const bearish: Candle[] = [{ time: 0, open: 1005, high: 1006, low: 994, close: 995 }]
const zeroRange: Candle[] = [{ time: 0, open: 1000, high: 1000, low: 1000, close: 1000 }]

describe('confirmation', () => {
  it('passes on a strong bullish continuation candle for a long', () => {
    const r = confirmation(bullish, 'long')
    expect(r.id).toBe('confirmation')
    expect(r.status).toBe('pass')
  })
  it('waits on an indecisive candle for a long', () => {
    expect(confirmation(doji, 'long').status).toBe('wait')
  })

  it('passes on a strong bearish continuation candle for a short', () => {
    const r = confirmation(bearish, 'short')
    expect(r.id).toBe('confirmation')
    expect(r.status).toBe('pass')
  })
  it('waits on an indecisive candle for a short', () => {
    expect(confirmation(doji, 'short').status).toBe('wait')
  })
  it('waits on a bullish candle for a short (wrong direction)', () => {
    expect(confirmation(bullish, 'short').status).toBe('wait')
  })

  it('waits when there is no candle to confirm', () => {
    const r = confirmation([], 'long')
    expect(r.id).toBe('confirmation')
    expect(r.status).toBe('wait')
  })
  it('waits on a zero-range candle without dividing by zero', () => {
    const r = confirmation(zeroRange, 'long')
    expect(r.status).toBe('wait')
  })
})
