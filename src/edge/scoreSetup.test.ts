import { describe, expect, it } from 'vitest'
import { scoreSetup, type EdgeInputs } from './scoreSetup'

const perfect: EdgeInputs = {
  biasStructureAgrees: true,
  priceCorrectSideEma: true,
  noOpposingLevelWithinAtr: true,
  retestHeld: true,
  entryNotExtended: true,
  stochNotExhausted: true,
  atrHealthy: true,
  confluenceCount: 3,
  sessionQuality: 'prime',
  rr: 3,
  targetBeforeOpposing: true,
}

describe('scoreSetup', () => {
  it('scores a perfect setup at 100 → grade A', () => {
    const s = scoreSetup(perfect)
    expect(s.total).toBe(100)
    expect(s.grade).toBe('A')
    expect(s.sections.reduce((a, x) => a + x.weight, 0)).toBe(100) // weights sum to 100
  })

  it('caps the grade at C when structure is weak (structure floor)', () => {
    // Extended entry drops Structure to 16/28 (< 16.8 floor) while the rest stays strong.
    const s = scoreSetup({ ...perfect, entryNotExtended: false })
    expect(s.structureFloorApplied).toBe(true)
    expect(s.grade).toBe('C')
  })

  it('caps confluence count at 3', () => {
    const capped = scoreSetup({ ...perfect, confluenceCount: 9 })
    expect(capped.total).toBe(100) // no more than 3×2 = 6 confluence points
  })

  it('awards zero timing points for an avoid/low session', () => {
    const s = scoreSetup({ ...perfect, sessionQuality: 'low' })
    expect(s.total).toBe(100 - 16)
    expect(s.grade).toBe('B') // 84
  })

  it('returns F below 50', () => {
    const weak: EdgeInputs = {
      ...perfect,
      biasStructureAgrees: false,
      priceCorrectSideEma: false,
      noOpposingLevelWithinAtr: false,
      entryNotExtended: false,
      stochNotExhausted: false,
      atrHealthy: false,
      confluenceCount: 0,
      sessionQuality: 'low',
      rr: 1.5,
      targetBeforeOpposing: false,
    }
    expect(scoreSetup(weak).grade).toBe('F')
  })
})
