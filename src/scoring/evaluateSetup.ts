import type { Candle, Config, Direction, GateResult, MarketContext } from '../types'
import { bias } from '../gates/bias'
import { structure } from '../gates/structure'
import { consolidation } from '../gates/consolidation'
import { levelId } from '../gates/levelId'
import { breakoutClose } from '../gates/breakoutClose'
import { confirmation } from '../gates/confirmation'
import { riskReward } from '../gates/riskReward'
import { swingPoints } from '../indicators/swingPoints'
import { positionSize, takeProfits } from './risk'
import { vetoes } from './vetoes'
import { score, type Score } from './score'

export type SetupVerdict =
  | { status: 'wait'; blockedBy: string; direction: Direction | null; gates: GateResult[]; vetoes: GateResult[]; score: Score }
  | { status: 'setup'; direction: Direction; level: number; entry: number; sl: number; tp1: number; tp2: number; lot: number; gates: GateResult[]; vetoes: GateResult[]; score: Score }

const WAIT = (id: string): GateResult => ({ id, status: 'wait', detail: 'Not evaluated — an earlier required gate did not pass.' })
const ORDER = ['h1-m15-bias', 'market-structure', 'consolidation', 'level-id', 'breakout-close', 'retest', 'confirmation', 'risk-reward'] as const

/** Nearest significant OPPOSING level beyond `entry`, for the structural TP cap (checklist step 11). */
function opposingLevel(candles: Candle[], direction: Direction, entry: number): number | undefined {
  const { highs, lows } = swingPoints(candles)
  if (direction === 'long') {
    const above = highs.map((i) => candles[i]!.high).filter((h) => h > entry)
    return above.length ? Math.min(...above) : undefined
  }
  const below = lows.map((i) => candles[i]!.low).filter((l) => l < entry)
  return below.length ? Math.max(...below) : undefined
}

/**
 * Required-gate sequence (checklist steps 1→9 & 14). Runs the gates in order and
 * short-circuits to WAIT on the first that is not `pass`, naming it in `blockedBy`.
 * The score/band is DISPLAY-ONLY — `authorized` is driven by this sequence, never the tally.
 * Any firing veto forces WAIT regardless of the sequence.
 */
export function evaluateSetup(ctx: MarketContext, config: Config): SetupVerdict {
  const results = new Map<string, GateResult>()
  const finish = (blockedBy: string, direction: Direction | null): SetupVerdict => {
    const gates = ORDER.map((id) => results.get(id) ?? WAIT(id))
    const vetoResults = vetoes(gates, config)
    return { status: 'wait', blockedBy, direction, gates, vetoes: vetoResults, score: score(gates, vetoResults, false) }
  }

  // 1. Bias → direction
  const b = bias(ctx, config)
  results.set('h1-m15-bias', b.result)
  if (b.result.status !== 'pass' || b.direction === null) return finish('h1-m15-bias', b.direction)
  const direction = b.direction

  // 2. Structure — `bias` already derives `direction` from H1 structure, so re-checking H1
  // here would be tautological (it would always pass once bias passed). Instead this gate is
  // an INDEPENDENT confirmation on M15: H1 sets the primary direction, M15 must independently
  // confirm the SAME direction still holds there (checklist step 2, gate id `h1-m15-bias`: H1
  // bias + M15 confirmation). A divergent M15 structure now correctly blocks the setup.
  const s = structure(ctx.m15, direction)
  results.set('market-structure', s)
  if (s.status !== 'pass') return finish('market-structure', direction)

  // 3. Consolidation (fail = NO-TRADE; only `pass` proceeds). This is a CURRENT-CHOP filter:
  // it checks price is not ranging AT THE ENTRY MOMENT (the latest bars), per checklist step 3
  // ("avoid initiating trades inside clear consolidation") — not that a base preceded the
  // breakout. It intentionally stays on the trailing window rather than the pre-breakout slice,
  // so it doesn't wrongly block classic base→breakout setups. A base→breakout QUALITY check
  // would be a separate, inverted-polarity gate — deferred to Phase 2.5.
  const con = consolidation(ctx.m5, config)
  results.set('consolidation', con)
  if (con.status !== 'pass') return finish('consolidation', direction)

  // 4. Level-ID
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

  // Bound the breakout scan to AFTER the level's pivot formed — a resistance/support cannot be
  // broken before it exists. `level` came directly off a swing bar, so match it with `===`.
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
  // `level` always originates from a swing bar, so the pivot is expected to be found; if it
  // somehow isn't, fall back to scanning the whole window (never silently skip a breakout).
  const scanStart = levelPivotIdx >= 0 ? levelPivotIdx + 1 : 0

  // 5. Breakout: first bar AFTER the level's pivot that CLOSED beyond level ± buffer.
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

  // 6. Retest: first bar after the breakout that returned to the level; hold vs. fail by close.
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
    // First touch broke back through the level → failed retest.
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

  // 7. Confirmation: first continuation candle after the retest. But a bar that CLOSES back
  // through the level BEFORE any confirmation forms is a whipsaw — structural invalidation.
  // `confirmation()` is shape-only (never checks price vs. level), so we guard it here and stop
  // scanning at the re-cross rather than accept a later, now-irrelevant bullish/bearish shape.
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

  // 8. Risk:reward — entry = latest close; SL = the broken level (structural invalidation).
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
  return { status: 'setup', direction, level, entry, sl, tp1, tp2, lot, gates, vetoes: vetoResults, score: score(gates, vetoResults, true) }
}
