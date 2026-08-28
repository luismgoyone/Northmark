// executor/errors.test.ts
import { describe, expect, it } from 'vitest'
import { ExecError, CATEGORIES } from './errors'

describe('ExecError', () => {
  it('carries a category from the fixed taxonomy and a message', () => {
    const e = new ExecError('DUPLICATE', 'event abc already processed')
    expect(e.category).toBe('DUPLICATE')
    expect(e.message).toMatch(/already processed/)
    expect(CATEGORIES).toContain('BROKER')
    expect(CATEGORIES).toHaveLength(9)
  })
})
