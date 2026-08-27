import type { Direction } from '../types.js'
import type { SimState } from '../sim/types.js'
import type { Grade } from '../edge/scoreSetup.js'
import { toSec } from './chartData.js'

export type EngineKey = 'dad' | 'claude'
export type TradeMarker = { time: number; engine: EngineKey; direction: Direction; result: 'win' | 'loss'; grade?: Grade }
export type PositionLine = { engine: EngineKey; direction: Direction; kind: 'entry' | 'sl' | 'tp'; price: number; grade?: Grade }

function markersFor(state: SimState, engine: EngineKey, candleSecs: Set<number>): TradeMarker[] {
  const out: TradeMarker[] = []
  for (const t of state.trades) {
    const time = toSec(t.openedAtTime)
    if (!candleSecs.has(time)) continue
    out.push({ time, engine, direction: t.direction, result: t.result, grade: t.grade })
  }
  return out
}

/** Entry markers for both engines' closed trades that land on a loaded candle. Pure. */
export function buildTradeMarkers(dad: SimState, claude: SimState, candleSecs: Set<number>): TradeMarker[] {
  return [...markersFor(dad, 'dad', candleSecs), ...markersFor(claude, 'claude', candleSecs)].sort((a, b) => a.time - b.time)
}

function linesFor(state: SimState, engine: EngineKey): PositionLine[] {
  const p = state.open
  if (!p) return []
  const base = { engine, direction: p.direction, grade: p.grade }
  return [
    { ...base, kind: 'entry', price: p.entry },
    { ...base, kind: 'sl', price: p.sl },
    { ...base, kind: 'tp', price: p.tp },
  ]
}

/** Entry/SL/TP lines for each engine's currently-open position (if any). Pure. */
export function buildPositionLines(dad: SimState, claude: SimState): PositionLine[] {
  return [...linesFor(dad, 'dad'), ...linesFor(claude, 'claude')]
}
