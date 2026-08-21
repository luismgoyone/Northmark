import { describe, expect, it } from 'vitest'
import { initialSimState, simStep, type SetupSignal } from './engine'
import type { SimConfig } from './types'
import type { Candle } from '../types'

const config: SimConfig = { startingBalance: 10_000, riskPct: 0.01 }
const candle = (time: number, high: number, low: number): Candle => ({
  time, open: (high + low) / 2, high, low, close: (high + low) / 2,
})
// risk 5, reward 10 → rr 2
const longSig: SetupSignal = { authorized: true, direction: 'long', entry: 100, sl: 95, tp: 110 }
const shortSig: SetupSignal = { authorized: true, direction: 'short', entry: 100, sl: 105, tp: 90 }
const wait: SetupSignal = { authorized: false }

describe('sim engine', () => {
  it('starts flat and armed with the full balance', () => {
    expect(initialSimState(config)).toEqual({
      startingBalance: 10_000, balance: 10_000, open: null, armed: true, trades: [], nextId: 1,
    })
  })

  it('opens one long position on an authorized setup (1% risk)', () => {
    const s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    expect(s.open).toMatchObject({ direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 100, rr: 2 })
    expect(s.armed).toBe(false)
    expect(s.nextId).toBe(2)
  })

  it('does not open a second position while one is open', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    s = simStep(s, longSig, config, candle(2, 101, 99)) // no TP/SL touch
    expect(s.trades).toHaveLength(0)
    expect(s.open?.id).toBe('t1')
  })

  it('closes a long as a WIN when the high reaches TP (+2R = +200 credits)', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    s = simStep(s, longSig, config, candle(2, 110, 108))
    expect(s.trades[0]).toMatchObject({ result: 'win', exitReason: 'tp', rMultiple: 2, pnlCredits: 200, exit: 110 })
    expect(s.balance).toBe(10_200)
    expect(s.open).toBeNull()
  })

  it('closes a long as a LOSS when the low reaches SL (-1R = -100 credits)', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    s = simStep(s, longSig, config, candle(2, 96, 94))
    expect(s.trades[0]).toMatchObject({ result: 'loss', exitReason: 'sl', rMultiple: -1, pnlCredits: -100, exit: 95 })
    expect(s.balance).toBe(9_900)
  })

  it('counts the STOP when one candle touches both TP and SL', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    s = simStep(s, longSig, config, candle(2, 111, 94))
    expect(s.trades[0]).toMatchObject({ result: 'loss', exitReason: 'sl' })
  })

  it('mirrors for a short (TP at low, SL at high)', () => {
    let win = simStep(initialSimState(config), shortSig, config, candle(1, 101, 99))
    win = simStep(win, shortSig, config, candle(2, 92, 90))
    expect(win.trades[0]).toMatchObject({ direction: 'short', result: 'win', rMultiple: 2 })
    let loss = simStep(initialSimState(config), shortSig, config, candle(1, 101, 99))
    loss = simStep(loss, shortSig, config, candle(2, 106, 104))
    expect(loss.trades[0]).toMatchObject({ result: 'loss', rMultiple: -1 })
  })

  it('will not re-open the same setup until the engine returns to WAIT', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99)) // open t1
    s = simStep(s, longSig, config, candle(2, 110, 108)) // win, closes; armed=false
    s = simStep(s, longSig, config, candle(3, 101, 99)) // still authorized but not armed → no open
    expect(s.open).toBeNull()
    expect(s.trades).toHaveLength(1)
    s = simStep(s, wait, config, candle(4, 101, 99)) // WAIT re-arms
    expect(s.armed).toBe(true)
    s = simStep(s, longSig, config, candle(5, 101, 99)) // fresh authorization opens t2
    expect(s.open?.id).toBe('t2')
  })

  it('does not open on WAIT — it just arms', () => {
    const s = simStep(initialSimState(config), wait, config, candle(1, 101, 99))
    expect(s.open).toBeNull()
    expect(s.armed).toBe(true)
  })

  it('guards against a zero-risk signal (entry === sl)', () => {
    const bad: SetupSignal = { authorized: true, direction: 'long', entry: 100, sl: 100, tp: 110 }
    const s = simStep(initialSimState(config), bad, config, candle(1, 101, 99))
    expect(s.open).toBeNull()
  })
})
