import { describe, expect, it } from 'vitest'
import { parseCandles, type TwelveDataValue } from './parseCandles'

const row = (datetime: string, o: number): TwelveDataValue => ({
  datetime,
  open: String(o),
  high: String(o + 1),
  low: String(o - 1),
  close: String(o + 0.5),
})

describe('parseCandles', () => {
  it('parses UTC datetimes to epoch ms and sorts ascending', () => {
    // provider returns newest-first; we want oldest-first
    const out = parseCandles([
      row('2026-08-14 12:05:00', 2400),
      row('2026-08-14 12:00:00', 2390),
    ])
    expect(out.map((c) => c.time)).toEqual([
      Date.UTC(2026, 7, 14, 12, 0, 0),
      Date.UTC(2026, 7, 14, 12, 5, 0),
    ])
    expect(out[0]).toMatchObject({
      open: 2390,
      high: 2391,
      low: 2389,
      close: 2390.5,
    })
  })

  it('includes volume only when present and non-empty', () => {
    const withVol: TwelveDataValue = {
      ...row('2026-08-14 12:00:00', 2400),
      volume: '123',
    }
    const noVol: TwelveDataValue = {
      ...row('2026-08-14 12:00:00', 2400),
      volume: '',
    }
    expect(parseCandles([withVol])[0]!.volume).toBe(123)
    expect(parseCandles([noVol])[0]!.volume).toBeUndefined()
  })

  it('throws on an unparseable datetime', () => {
    expect(() => parseCandles([row('not-a-date', 2400)])).toThrow(/Unparseable/)
  })
})
