import { describe, expect, it } from 'vitest'
import type { GateResult } from '../types'
import { score } from './score'

const passes = (n: number): GateResult[] =>
  Array.from({ length: n }, (_, i) => ({ id: `pass-${i}`, status: 'pass', detail: '' }))
const sup = (statuses: GateResult['status'][]): GateResult[] =>
  statuses.map((s, i) => ({ id: `sup-${i}`, status: s, detail: '' }))

describe('score (band from authorization + supporting)', () => {
  it('band is wait whenever not authorized, regardless of gate tally', () => {
    expect(score(passes(7)).band).toBe('wait')
    expect(score(passes(7), [], false, sup(['pass', 'pass'])).band).toBe('wait')
  })

  it('authorized + all supporting pass → strong', () => {
    expect(score(passes(7), [], true, sup(['pass', 'pass']))).toEqual({
      passed: 7, band: 'strong', authorized: true,
    })
  })

  it('authorized + a supporting confirmation withheld → building', () => {
    expect(score(passes(7), [], true, sup(['pass', 'wait'])).band).toBe('building')
  })

  it('authorized with NO supporting checks → building (never strong without confirmation)', () => {
    expect(score(passes(7), [], true, []).band).toBe('building')
  })

  it('a firing veto forces wait and demotes authorized', () => {
    const veto: GateResult = { id: 'x', status: 'fail', detail: '' }
    expect(score(passes(7), [veto], true, sup(['pass', 'pass']))).toEqual({
      passed: 7, band: 'wait', authorized: false,
    })
  })

  it('non-firing vetoes (wait/pass) do not override an authorized strong band', () => {
    expect(score(passes(7), [{ id: 'a', status: 'wait', detail: '' }], true, sup(['pass', 'pass'])).band).toBe('strong')
    expect(score(passes(7), [{ id: 'a', status: 'pass', detail: '' }], true, sup(['pass', 'pass'])).band).toBe('strong')
  })

  it('passed counts only pass-status gates', () => {
    const mixed: GateResult[] = [
      { id: 'a', status: 'pass', detail: '' },
      { id: 'b', status: 'fail', detail: '' },
      { id: 'c', status: 'wait', detail: '' },
      { id: 'd', status: 'pass', detail: '' },
    ]
    expect(score(mixed).passed).toBe(2)
  })

  it('defaults: authorized false, band wait, passed 0 for empty input', () => {
    expect(score([])).toEqual({ passed: 0, band: 'wait', authorized: false })
  })
})
