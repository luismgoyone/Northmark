import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candle } from '../types'
import { fetchCandles } from './twelveData'

/**
 * Twelve Data returns values newest-first (descending), all fields as strings.
 * Fixture: three M5 candles at 2100 → 2101 → 2102 close, descending by time.
 */
function successPayload() {
  return {
    status: 'ok',
    values: [
      // newest first (descending time)
      { datetime: '2026-08-14 12:10:00', open: '2101.5', high: '2103.0', low: '2101.0', close: '2102.0', volume: '300' },
      { datetime: '2026-08-14 12:05:00', open: '2100.5', high: '2102.0', low: '2100.0', close: '2101.0', volume: '200' },
      { datetime: '2026-08-14 12:00:00', open: '2099.5', high: '2101.0', low: '2099.0', close: '2100.0', volume: '100' },
    ],
  }
}

/** Build a fetch stub that captures the URL and resolves the given JSON payload. */
function stubFetch(payload: unknown) {
  const fetchMock = vi.fn(
    async (_url: string) => ({ ok: true, json: async () => payload }) as unknown as Response,
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Set (or clear) the Twelve Data API key on import.meta.env for a test. */
function setKey(key: string | undefined) {
  vi.stubEnv('VITE_TWELVEDATA_KEY', key as string)
}

beforeEach(() => {
  setKey('test-key-123')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('fetchCandles', () => {
  it('normalizes a descending string-field response into ascending numeric Candles', async () => {
    stubFetch(successPayload())

    const candles: Candle[] = await fetchCandles('M5')

    expect(candles).toHaveLength(3)

    // Ascending time: oldest (12:00, close 2100) first, newest (12:10, close 2102) last.
    expect(candles[0]?.close).toBe(2100)
    expect(candles[1]?.close).toBe(2101)
    expect(candles[2]?.close).toBe(2102)

    // Times must be strictly ascending.
    expect(candles[0]!.time).toBeLessThan(candles[1]!.time)
    expect(candles[1]!.time).toBeLessThan(candles[2]!.time)

    // All fields are numeric, not strings.
    const first = candles[0]!
    expect(typeof first.time).toBe('number')
    expect(first.open).toBe(2099.5)
    expect(first.high).toBe(2101)
    expect(first.low).toBe(2099)
    expect(first.close).toBe(2100)
    expect(first.volume).toBe(100)
  })

  it('encodes time as epoch milliseconds', async () => {
    stubFetch(successPayload())

    const candles = await fetchCandles('M5')

    // '2026-08-14 12:00:00' UTC = 1786795200000 ms.
    expect(candles[0]!.time).toBe(Date.parse('2026-08-14 12:00:00 UTC'))
    expect(candles[0]!.time).toBeGreaterThan(1e12) // ms magnitude, not seconds
  })

  it('maps H1 to interval=1h in the request URL', async () => {
    const fetchMock = stubFetch(successPayload())

    await fetchCandles('H1')

    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain('interval=1h')
    expect(url).toContain('symbol=XAU/USD')
    expect(url).toContain('apikey=test-key-123')
  })

  it('maps M5 to interval=5min in the request URL', async () => {
    const fetchMock = stubFetch(successPayload())
    await fetchCandles('M5')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('interval=5min')
  })

  it('maps M15 to interval=15min in the request URL', async () => {
    const fetchMock = stubFetch(successPayload())
    await fetchCandles('M15')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('interval=15min')
  })

  it('throws when the API key is missing (never fetches with an empty key)', async () => {
    setKey('')
    const fetchMock = stubFetch(successPayload())

    await expect(fetchCandles('M5')).rejects.toThrow(/VITE_TWELVEDATA_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws with the provider message on a Twelve Data error payload', async () => {
    stubFetch({ status: 'error', code: 401, message: 'Invalid API key' })

    await expect(fetchCandles('M5')).rejects.toThrow(/Invalid API key/)
  })
})
