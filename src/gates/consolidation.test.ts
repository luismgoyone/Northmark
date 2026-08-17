import { describe, expect, it } from 'vitest'
import { consolidation } from './consolidation'
import { defaultConfig } from '../config'
import { rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'

describe('consolidation', () => {
  it('fails (NO-TRADE) on a flat overlapping range', () => {
    const r = consolidation(rangeSeries(20), defaultConfig)
    expect(r.id).toBe('consolidation')
    expect(r.status).toBe('fail')
  })
  it('passes on a clean directional trend', () => {
    expect(consolidation(trendSeries('up', 6), defaultConfig).status).toBe('pass')
  })
})
