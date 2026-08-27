import { describe, expect, it } from 'vitest'
import { buildTradeMarkers, buildPositionLines } from './chartOverlays'
import type { SimState, SimTrade, SimPosition } from '../sim/types'

const T = 1_800_000_000_000 // epoch ms
const sec = Math.floor(T / 1000)

const trade = (over: Partial<SimTrade>): SimTrade => ({
  id: 't', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2,
  openedAtTime: T, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 4, closedAtTime: T + 1000,
  ...over,
})
const pos = (over: Partial<SimPosition>): SimPosition => ({
  id: 'p', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2, openedAtTime: T, ...over,
})
const state = (over: Partial<SimState>): SimState => ({
  startingBalance: 200, balance: 200, open: null, armed: true, nextId: 1, trades: [], ...over,
})

describe('buildTradeMarkers', () => {
  it('emits a marker per trade whose openedAtTime matches a loaded candle, tagged by engine', () => {
    const dad = state({ trades: [trade({ result: 'loss', exitReason: 'sl' })] })
    const claude = state({ trades: [trade({ grade: 'A' })] })
    const markers = buildTradeMarkers(dad, claude, new Set([sec]))
    expect(markers).toHaveLength(2)
    expect(markers.find((m) => m.engine === 'dad')).toMatchObject({ time: sec, result: 'loss', direction: 'long' })
    expect(markers.find((m) => m.engine === 'claude')).toMatchObject({ time: sec, result: 'win', grade: 'A' })
  })

  it('drops trades whose time is not in the candle set', () => {
    const dad = state({ trades: [trade({})] })
    expect(buildTradeMarkers(dad, state({}), new Set([sec + 999]))).toHaveLength(0)
  })
})

describe('buildPositionLines', () => {
  it('emits entry/sl/tp lines for each engine open position', () => {
    const dad = state({ open: pos({ direction: 'short', entry: 200, sl: 205, tp: 190 }) })
    const claude = state({ open: pos({ grade: 'B' }) })
    const lines = buildPositionLines(dad, claude)
    expect(lines.filter((l) => l.engine === 'dad').map((l) => l.kind).sort()).toEqual(['entry', 'sl', 'tp'])
    expect(lines.find((l) => l.engine === 'dad' && l.kind === 'sl')?.price).toBe(205)
    expect(lines.find((l) => l.engine === 'claude' && l.kind === 'entry')?.grade).toBe('B')
  })

  it('returns [] when neither engine has an open position', () => {
    expect(buildPositionLines(state({}), state({}))).toEqual([])
  })
})
