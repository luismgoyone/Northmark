import type { Candle, Config, Direction, GateResult, MarketContext } from '../types.js'
import { bias } from '../gates/bias.js'
import { structure } from '../gates/structure.js'
import { emaAlignment } from '../gates/emaAlignment.js'
import { consolidation } from '../gates/consolidation.js'
import { levelId } from '../gates/levelId.js'
import { breakoutClose } from '../gates/breakoutClose.js'
import { confirmation } from '../gates/confirmation.js'
import { riskReward } from '../gates/riskReward.js'
import { swingPoints } from '../indicators/swingPoints.js'
import { positionSize, takeProfits } from './risk.js'
import { vetoes } from './vetoes.js'
import { score, type Score } from './score.js'

export type SetupVerdict =
  | { status: 'wait'; blockedBy: string; direction: Direction | null; gates: GateResult[]; supporting: GateResult[]; vetoes: GateResult[]; score: Score }
  | { status: 'setup'; direction: Direction; level: number; entry: number; sl: number; tp1: number; tp2: number; lot: number; gates: GateResult[]; supporting: GateResult[]; vetoes: GateResult[]; score: Score }

const WAIT = (id: string): GateResult => ({ id, status: 'wait', detail: 'Not evaluated — an earlier required gate did not pass.' })

// Hard required filters, in checklist order. M15 structure + EMA9 are SUPPORTING (below),
// not in this sequence (2026-08-20 reframe).
const ORDER = ['h1-m15-bias', 'consolidation', 'level-id', 'breakout-close', 'retest', 'confirmation', 'risk-reward'] as const

/** Nearest significant OPPOSING level beyond `entry`, for the structural TP cap (checklist step 11). */
export function opposingLevel(candles: Candle[], direction: Direction, entry: number): number | undefined {
  const { highs, lows } = swingPoints(candles)
  if (direction === 'long') {
    const above = highs.map((i) => candles[i]!.high).filter((h) => h > entry)
    return above.length ? Math.min(...above) : undefined
  }
  const below = lows.map((i) => candles[i]!.low).filter((l) => l < entry)
  return below.length ? Math.max(...below) : undefined
}

/**
 * Required-gate sequence (hard filters) + supporting confirmations.
 * Runs the 7 hard gates in order and short-circuits to WAIT on the first non-'pass',
 * naming it in `blockedBy`. M15 structure + EMA9 alignment are evaluated as SUPPORTING
 * once the direction is known — they never block; they only move the confidence band.
 * `authorized` is driven by the hard sequence; any firing veto forces WAIT.
 */
export function evaluateSetup(ctx: MarketContext, config: Config): SetupVerdict {
  const results = new Map<string, GateResult>()
  let supporting: GateResult[] = []
  const finish = (blockedBy: string, direction: Direction | null): SetupVerdict => {
    const gates = ORDER.map((id) => results.get(id) ?? WAIT(id))
    const vetoResults = vetoes(gates, config)
    return { status: 'wait', blockedBy, direction, gates, supporting, vetoes: vetoResults, score: score(gates, vetoResults, false, supporting) }
  }

  // 1. Bias → direction (hard filter)
  const b = bias(ctx)
  results.set('h1-m15-bias', b.result)
  if (b.result.status !== 'pass' || b.direction === null) return finish('h1-m15-bias', b.direction)
  const direction = b.direction

  // Supporting confirmations — evaluated now that direction is known; NEVER block.
  // M15 structure (independent of the H1 bias that set direction) + H1 EMA9 alignment.
  supporting = [structure(ctx.m15, direction), emaAlignment(ctx, direction, config)]

  // 2. Consolidation (hard; CURRENT-CHOP filter — checklist step 3). fail = NO-TRADE.
  const con = consolidation(ctx.m5, config)
  results.set('consolidation', con)
  if (con.status !== 'pass') return finish('consolidation', direction)

  // 3. Level-ID (hard)
  const lvl = levelId(ctx.m5, direction)
  results.set('level-id', lvl.result)
  if (lvl.result.status !== 'pass' || lvl.level === null) return finish('level-id', direction)
  const level = lvl.level

  // Temporal narrative scan on M5 (checklist steps 5→9). The broken `level` sits on the far
  // side of price now; detect the completed break → retest → confirm story across the window.
  const c = ctx.m5
  const buffer = config.tolerances.breakoutBufferPips * 0.01
  const band = level * config.tolerances.retestBand
  const isLong = direction === 'long'

  // Bound the breakout scan to AFTER the level's pivot formed — a level cannot break before it exists.
  const { highs, lows } = swingPoints(c)
  let levelPivotIdx = -1
  const pivotIdxs = isLong ? highs : lows
  for (let p = pivotIdxs.length - 1; p >= 0; p--) {
    const idx = pivotIdxs[p]!
    if ((isLong ? c[idx]!.high : c[idx]!.low) === level) {
      levelPivotIdx = idx
      break
    }
  }
  const scanStart = levelPivotIdx >= 0 ? levelPivotIdx + 1 : 0

  // 4. Breakout: first bar AFTER the level's pivot that CLOSED beyond level ± buffer.
  let breakoutIdx = -1
  for (let i = scanStart; i < c.length; i++) {
    const close = c[i]!.close
    if (isLong ? close > level + buffer : close < level - buffer) {
      breakoutIdx = i
      break
    }
  }
  if (breakoutIdx === -1) {
    results.set('breakout-close', {
      id: 'breakout-close',
      status: 'wait',
      detail: `No candle has closed ${isLong ? 'above' : 'below'} level ${level} ${isLong ? '+' : '−'} buffer ${buffer} in the window.`,
    })
    return finish('breakout-close', direction)
  }
  results.set('breakout-close', breakoutClose(c.slice(0, breakoutIdx + 1), level, direction, config))

  // 5. Retest: first bar after the breakout that returned to the level; hold vs. fail by close.
  let retestIdx = -1
  for (let j = breakoutIdx + 1; j < c.length; j++) {
    const bar = c[j]!
    const touched = isLong ? bar.low <= level + band : bar.high >= level - band
    if (!touched) continue
    const held = isLong ? bar.close >= level : bar.close <= level
    if (held) {
      retestIdx = j
      results.set('retest', {
        id: 'retest',
        status: 'pass',
        detail: `Retest at bar ${j}: ${isLong ? `low ${bar.low}` : `high ${bar.high}`} touched band, close ${bar.close} held ${isLong ? '≥' : '≤'} level ${level}.`,
      })
      break
    }
    results.set('retest', {
      id: 'retest',
      status: 'fail',
      detail: `Failed retest at bar ${j}: close ${bar.close} fell back ${isLong ? 'below' : 'above'} level ${level}.`,
    })
    return finish('retest', direction)
  }
  if (retestIdx === -1) {
    results.set('retest', {
      id: 'retest',
      status: 'wait',
      detail: 'Breakout occurred but price has not returned to hold the level yet.',
    })
    return finish('retest', direction)
  }

  // 6. Confirmation: first continuation candle after the retest; a re-cross before it invalidates.
  let confirmIdx = -1
  for (let k = retestIdx + 1; k < c.length; k++) {
    const invalidated = isLong ? c[k]!.close < level : c[k]!.close > level
    if (invalidated) {
      results.set('confirmation', {
        id: 'confirmation',
        status: 'wait',
        detail: `Price closed back through level ${level} at bar ${k} after the retest; setup invalidated.`,
      })
      return finish('confirmation', direction)
    }
    if (confirmation(c.slice(0, k + 1), direction).status === 'pass') {
      confirmIdx = k
      break
    }
  }
  if (confirmIdx === -1) {
    results.set('confirmation', {
      id: 'confirmation',
      status: 'wait',
      detail: 'Retest held but no confirmation candle in the breakout direction yet.',
    })
    return finish('confirmation', direction)
  }
  results.set('confirmation', confirmation(c.slice(0, confirmIdx + 1), direction))

  // 7. Risk:reward — entry = latest close; SL = the broken level (structural invalidation).
  const entry = c[c.length - 1]!.close
  const sl = level
  const slDistance = Math.abs(entry - sl)
  const nextSR = opposingLevel(c, direction, entry)
  const { tp1, tp2 } = takeProfits(entry, slDistance, direction, nextSR)
  const rr = riskReward(entry, sl, tp2, direction, config)
  results.set('risk-reward', rr)
  if (rr.status !== 'pass') return finish('risk-reward', direction)

  const gates = ORDER.map((id) => results.get(id)!)
  const vetoResults = vetoes(gates, config)
  if (vetoResults.some((v) => v.status === 'fail')) return finish('veto', direction)

  const lot = positionSize(config.accountSize, config.riskPct, slDistance, config.contractSize)
  return { status: 'setup', direction, level, entry, sl, tp1, tp2, lot, gates, supporting, vetoes: vetoResults, score: score(gates, vetoResults, true, supporting) }
}
