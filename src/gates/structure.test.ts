import { describe, expect, it } from 'vitest'
import { structure, structureDirection } from './structure'
import { rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'

describe('structureDirection', () => {
  it('reads a rising staircase as long', () => {
    expect(structureDirection(trendSeries('up'))).toBe('long')
  })
  it('reads a falling staircase as short', () => {
    expect(structureDirection(trendSeries('down'))).toBe('short')
  })
  it('returns null for an overlapping range', () => {
    expect(structureDirection(rangeSeries())).toBeNull()
  })
})

describe('structure', () => {
  it('passes when the requested direction matches the detected structure', () => {
    const r = structure(trendSeries('up'), 'long')
    expect(r.id).toBe('market-structure')
    expect(r.status).toBe('pass')
  })
  it('waits when the requested direction contradicts the structure', () => {
    expect(structure(trendSeries('up'), 'short').status).toBe('wait')
  })
})
