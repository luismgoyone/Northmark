import { describe, expect, it } from 'vitest'
import { applyLimit, applyTick, initBlob, isCreditLimitError, isDue, planFetch, M15_MS, H1_MS } from './serverTick'
import { defaultConfig } from './config'
import type { SimConfig } from './sim/types'
import type { Candle } from './types'

const simConfig: SimConfig = { startingBalance: 10_000, riskPct: 0.01 }
const flat = (t: number): Candle => ({ time: t, open: 100, high: 100, low: 100, close: 100 })

describe('isDue', () => {
  it('is due when never fetched or the interval has elapsed', () => {
    expect(isDue(M15_MS, null, 1000)).toBe(true)
    expect(isDue(M15_MS, 0, M15_MS)).toBe(true)
    expect(isDue(M15_MS, 0, M15_MS - 1)).toBe(false)
  })
})

describe('planFetch', () => {
  it('fetches higher timeframes only when their interval has elapsed', () => {
    const blob = initBlob(simConfig)
    expect(planFetch(blob, 1000)).toEqual({ m15: true, h1: true }) // never fetched → due
    const warm = { ...blob, m15FetchedAt: 1000, h1FetchedAt: 1000 }
    expect(planFetch(warm, 1000 + M15_MS - 1)).toEqual({ m15: false, h1: false })
    expect(planFetch(warm, 1000 + M15_MS)).toEqual({ m15: true, h1: false })
    expect(planFetch(warm, 1000 + H1_MS)).toEqual({ m15: true, h1: true })
  })
})

describe('applyTick', () => {
  it('reuses cached m15/h1 when not refetched, refreshes fetch times when it is', () => {
    const blob = { ...initBlob(simConfig), m15: [flat(1)], h1: [flat(1)], m15FetchedAt: 500, h1FetchedAt: 500 }
    const next = applyTick(blob, { m5: [flat(2)] }, defaultConfig, 999)
    expect(next.m15).toEqual([flat(1)]) // reused
    expect(next.m15FetchedAt).toBe(500) // unchanged (not refetched)
    expect(next.updatedAt).toBe(999)
    expect(next.limitReachedAt).toBeNull()

    const refetched = applyTick(blob, { m5: [flat(2)], m15: [flat(2)] }, defaultConfig, 1000)
    expect(refetched.m15).toEqual([flat(2)])
    expect(refetched.m15FetchedAt).toBe(1000)
  })
})

describe('applyLimit', () => {
  it('stamps the limit time and does not touch state', () => {
    const blob = initBlob(simConfig)
    const out = applyLimit(blob, 4242)
    expect(out.limitReachedAt).toBe(4242)
    expect(out.state).toBe(blob.state)
  })
})

describe('isCreditLimitError', () => {
  it('recognizes Twelve Data credit/limit errors, ignores others', () => {
    expect(isCreditLimitError({ status: 'error', code: 429, message: 'run out of API credits' })).toBe(true)
    expect(isCreditLimitError({ status: 'error', code: 400, message: 'you have exhausted your daily limit' })).toBe(true)
    expect(isCreditLimitError({ status: 'error', code: 404, message: 'symbol not found' })).toBe(false)
    expect(isCreditLimitError({ status: 'ok', values: [] })).toBe(false)
    expect(isCreditLimitError(null)).toBe(false)
  })
})
