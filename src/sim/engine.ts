import type { Candle, Direction } from '../types'
import type { SimConfig, SimPosition, SimState, SimTrade } from './types'

export type SetupSignal =
  | { authorized: true; direction: Direction; entry: number; sl: number; tp: number }
  | { authorized: false }

export function initialSimState(config: SimConfig): SimState {
  return {
    startingBalance: config.startingBalance,
    balance: config.startingBalance,
    open: null,
    armed: true,
    trades: [],
    nextId: 1,
  }
}

/** Close the open position against the latest candle. SL-first if both are touched. */
function settle(state: SimState, candle: Candle): SimState {
  const pos = state.open
  if (!pos) return state
  const isLong = pos.direction === 'long'
  const hitSl = isLong ? candle.low <= pos.sl : candle.high >= pos.sl
  const hitTp = isLong ? candle.high >= pos.tp : candle.low <= pos.tp
  if (!hitSl && !hitTp) return state
  const exitReason: 'tp' | 'sl' = hitSl ? 'sl' : 'tp'
  const result: 'win' | 'loss' = exitReason === 'tp' ? 'win' : 'loss'
  const exit = exitReason === 'tp' ? pos.tp : pos.sl
  const rMultiple = exitReason === 'tp' ? pos.rr : -1
  const pnlCredits = pos.riskCredits * rMultiple
  const trade: SimTrade = { ...pos, exit, exitReason, result, rMultiple, pnlCredits, closedAtTime: candle.time }
  return {
    ...state,
    balance: state.balance + pnlCredits,
    open: null,
    armed: false,
    trades: [...state.trades, trade],
  }
}

/** Open a position when armed, flat, and a setup is authorized. */
function maybeOpen(state: SimState, signal: SetupSignal, config: SimConfig, candle: Candle): SimState {
  if (!signal.authorized) {
    return state.armed ? state : { ...state, armed: true } // returned to WAIT → re-arm
  }
  if (state.open !== null || !state.armed) return state
  const riskDist = Math.abs(signal.entry - signal.sl)
  const rewardDist = Math.abs(signal.tp - signal.entry)
  const riskCredits = state.balance * config.riskPct
  // Guard a degenerate setup / config that would size a bad position.
  if (!(riskDist > 0) || !(riskCredits > 0) || !Number.isFinite(riskCredits)) return state
  const pos: SimPosition = {
    id: `t${state.nextId}`,
    direction: signal.direction,
    entry: signal.entry,
    sl: signal.sl,
    tp: signal.tp,
    riskCredits,
    rr: rewardDist / riskDist,
    openedAtTime: candle.time,
  }
  return { ...state, open: pos, armed: false, nextId: state.nextId + 1 }
}

/** One tick: settle the open position against `latest`, then maybe open a new one. */
export function simStep(state: SimState, signal: SetupSignal, config: SimConfig, latest: Candle): SimState {
  return maybeOpen(settle(state, latest), signal, config, latest)
}
