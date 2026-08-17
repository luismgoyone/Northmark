import { describe, expect, it } from 'vitest'
import { bias } from './bias'
import { defaultConfig } from '../config'
import { rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'
import type { MarketContext } from '../types'

const ctxWith = (h1: MarketContext['h1']): MarketContext => ({ m5: h1, m15: h1, h1 })

describe('bias', () => {
  it('emits long when H1 structure rises and EMA9 does not contradict', () => {
    const { result, direction } = bias(ctxWith(trendSeries('up')), defaultConfig)
    expect(result.id).toBe('h1-m15-bias')
    expect(result.status).toBe('pass')
    expect(direction).toBe('long')
  })

  it('emits short for a falling H1', () => {
    const { direction } = bias(ctxWith(trendSeries('down')), defaultConfig)
    expect(direction).toBe('short')
  })

  it('waits with null direction when H1 is an unclear range', () => {
    const { result, direction } = bias(ctxWith(rangeSeries()), defaultConfig)
    expect(result.status).toBe('wait')
    expect(direction).toBeNull()
  })
})
