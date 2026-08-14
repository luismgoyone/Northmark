import { describe, expect, it } from 'vitest'
import type { GateResult } from '../types'
import { score } from './score'

/** Build `n` passing gate results (distinct ids). */
const passes = (n: number): GateResult[] =>
  Array.from({ length: n }, (_, i) => ({ id: `pass-${i}`, status: 'pass', detail: '' }))

describe('score', () => {
  it('counts passing gates and bands 3 as wait', () => {
    expect(score(passes(3))).toEqual({ passed: 3, band: 'wait' })
  })

  it('bands 6 passing gates as building', () => {
    expect(score(passes(6))).toEqual({ passed: 6, band: 'building' })
  })

  it('bands 9 passing gates as strong', () => {
    expect(score(passes(9))).toEqual({ passed: 9, band: 'strong' })
  })

  it('bands the boundary passed=4 as wait and passed=5 as building', () => {
    expect(score(passes(4)).band).toBe('wait')
    expect(score(passes(5)).band).toBe('building')
  })

  it('bands the boundary passed=7 as building and passed=8 as strong', () => {
    expect(score(passes(7)).band).toBe('building')
    expect(score(passes(8)).band).toBe('strong')
  })

  it('forces band to wait when any veto has status fail (passed unchanged)', () => {
    const veto: GateResult = { id: 'x', status: 'fail', detail: '' }
    expect(score(passes(9), [veto])).toEqual({ passed: 9, band: 'wait' })
  })

  it('does not override when all vetoes are wait (real Phase-1 output shape)', () => {
    const phase1Vetoes: GateResult[] = [
      { id: 'a', status: 'wait', detail: 'deferred' },
      { id: 'b', status: 'wait', detail: 'deferred' },
    ]
    expect(score(passes(9), phase1Vetoes)).toEqual({ passed: 9, band: 'strong' })
  })

  it('does not override on a passing veto (status pass is cleared, not triggered)', () => {
    const clearedVeto: GateResult = { id: 'a', status: 'pass', detail: '' }
    expect(score(passes(9), [clearedVeto]).band).toBe('strong')
  })

  it('bands empty gates as wait with passed 0', () => {
    expect(score([])).toEqual({ passed: 0, band: 'wait' })
  })

  it('counts only pass status among mixed pass/fail/wait gates', () => {
    const mixed: GateResult[] = [
      { id: 'a', status: 'pass', detail: '' },
      { id: 'b', status: 'fail', detail: '' },
      { id: 'c', status: 'wait', detail: '' },
      { id: 'd', status: 'pass', detail: '' },
    ]
    expect(score(mixed)).toEqual({ passed: 2, band: 'wait' })
  })

  it('defaults vetoes to empty so a strong band is not overridden', () => {
    expect(score(passes(8)).band).toBe('strong')
  })
})
