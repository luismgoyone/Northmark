import { describe, expect, it } from 'vitest'
import { parseEconomicCalendar } from './newsProvider'

describe('parseEconomicCalendar', () => {
  it('maps a Finnhub-style { economicCalendar: [...] } payload to NewsEvent[]', () => {
    const raw = {
      economicCalendar: [
        { time: '2026-08-28 12:30:00', country: 'US', event: 'CPI m/m', impact: 'high' },
        { time: '2026-08-28 14:00:00', country: 'DE', event: 'Ifo', impact: 'medium' },
      ],
    }
    const events = parseEconomicCalendar(raw)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({
      time: Date.parse('2026-08-28T12:30:00Z'),
      impact: 'high',
      currency: 'USD',
      title: 'CPI m/m',
    })
    expect(events[1]?.currency).toBe('EUR') // DE → EUR
  })

  it('treats an offset-less ISO string with a T as UTC', () => {
    const raw = [{ time: '2026-08-28T12:30:00', country: 'US', event: 'CPI m/m', impact: 'high' }]
    const events = parseEconomicCalendar(raw)
    expect(events[0]?.time).toBe(Date.parse('2026-08-28T12:30:00Z'))
  })

  it('accepts a bare array and epoch-second times', () => {
    const raw = [{ time: 1_800_000_000, country: 'US', event: 'NFP', impact: 'high' }]
    const events = parseEconomicCalendar(raw)
    expect(events[0]?.time).toBe(1_800_000_000_000) // seconds → ms
    expect(events[0]?.title).toBe('NFP')
  })

  it('skips unparseable entries and tolerates missing impact (defaults low)', () => {
    const raw = { economicCalendar: [{ country: 'US', event: 'No time here' }, { time: 'garbage', country: 'US', event: 'Bad' }] }
    expect(parseEconomicCalendar(raw)).toHaveLength(0)
  })

  it('returns [] for non-object / null input', () => {
    expect(parseEconomicCalendar(null)).toEqual([])
    expect(parseEconomicCalendar('nope')).toEqual([])
  })
})
