import { describe, expect, it } from 'vitest'
import { newsBlackout, type NewsEvent } from './newsWindow'

const now = 1_000_000_000_000
const ev = (offsetMin: number, over: Partial<NewsEvent> = {}): NewsEvent => ({
  time: now + offsetMin * 60_000,
  impact: 'high',
  currency: 'USD',
  title: 'CPI',
  ...over,
})

describe('newsBlackout', () => {
  it('blocks on a high-impact USD event within ±30 min', () => {
    expect(newsBlackout([ev(10)], now)?.title).toBe('CPI')
    expect(newsBlackout([ev(-25)], now)).not.toBeNull()
  })
  it('ignores events outside the window', () => {
    expect(newsBlackout([ev(45)], now)).toBeNull()
  })
  it('ignores non-high impact and irrelevant currencies', () => {
    expect(newsBlackout([ev(5, { impact: 'medium' })], now)).toBeNull()
    expect(newsBlackout([ev(5, { currency: 'EUR' })], now)).toBeNull()
  })
  it('treats XAU/GOLD/ALL as relevant', () => {
    expect(newsBlackout([ev(5, { currency: 'XAU' })], now)).not.toBeNull()
    expect(newsBlackout([ev(5, { currency: 'ALL' })], now)).not.toBeNull()
  })
})
