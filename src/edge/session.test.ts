import { describe, expect, it } from 'vitest'
import { classifySession, isFridayLate } from './session'

// Instants chosen to exercise the London/NY windows AND the DST boundary.
const utc = (iso: string): number => new Date(iso).getTime()

describe('classifySession', () => {
  it('marks the London–NY overlap as prime (summer)', () => {
    // 2026-07-01 14:00Z → London 15:00 BST, NY 10:00 EDT → both active.
    expect(classifySession(utc('2026-07-01T14:00:00Z')).quality).toBe('prime')
  })

  it('is DST-aware: the same UTC instant differs winter vs summer', () => {
    // 12:30Z. Winter: London 12:30 GMT, NY 07:30 EST → NY not yet open → 'good'.
    expect(classifySession(utc('2026-01-15T12:30:00Z')).quality).toBe('good')
    // Summer: London 13:30 BST, NY 08:30 EDT → both active → 'prime'.
    expect(classifySession(utc('2026-07-01T12:30:00Z')).quality).toBe('prime')
  })

  it('marks the NY rollover hour as avoid', () => {
    // 2026-07-01 21:30Z → NY 17:30 EDT → rollover dead-zone.
    expect(classifySession(utc('2026-07-01T21:30:00Z')).quality).toBe('avoid')
  })

  it('marks the Asian/off-session as low', () => {
    // 2026-07-01 02:00Z → London 03:00, NY 22:00 → neither active.
    expect(classifySession(utc('2026-07-01T02:00:00Z')).quality).toBe('low')
  })
})

describe('isFridayLate', () => {
  it('is true late Friday NY time', () => {
    // 2026-07-03 is a Friday. 20:00Z → NY 16:00 EDT.
    expect(isFridayLate(utc('2026-07-03T20:00:00Z'))).toBe(true)
  })
  it('is false midweek', () => {
    expect(isFridayLate(utc('2026-07-01T20:00:00Z'))).toBe(false)
  })
})
