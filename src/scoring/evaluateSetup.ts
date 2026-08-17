import type { Config, Direction, GateResult, MarketContext } from '../types'
import { bias } from '../gates/bias'
import { structure } from '../gates/structure'
import { consolidation } from '../gates/consolidation'
import { levelId } from '../gates/levelId'
import { breakoutClose } from '../gates/breakoutClose'
import { retest } from '../gates/retest'
import { confirmation } from '../gates/confirmation'
import { riskReward } from '../gates/riskReward'
import { positionSize, takeProfits } from './risk'
import { vetoes } from './vetoes'
import { score, type Score } from './score'

export type SetupVerdict =
  | { status: 'wait'; blockedBy: string; direction: Direction | null; gates: GateResult[]; vetoes: GateResult[]; score: Score }
  | { status: 'setup'; direction: Direction; level: number; entry: number; sl: number; tp1: number; tp2: number; lot: number; gates: GateResult[]; vetoes: GateResult[]; score: Score }

const WAIT = (id: string): GateResult => ({ id, status: 'wait', detail: 'Not evaluated — an earlier required gate did not pass.' })
const ORDER = ['h1-m15-bias', 'market-structure', 'consolidation', 'level-id', 'breakout-close', 'retest', 'confirmation', 'risk-reward'] as const

/**
 * Required-gate sequence (checklist steps 1→9 & 14). Runs the gates in order and
 * short-circuits to WAIT on the first that is not `pass`, naming it in `blockedBy`.
 * The score/band is DISPLAY-ONLY — `authorized` is driven by this sequence, never the tally.
 * Any firing veto forces WAIT regardless of the sequence.
 */
export function evaluateSetup(ctx: MarketContext, config: Config): SetupVerdict {
  const vetoResults = vetoes(ctx, config)
  const results = new Map<string, GateResult>()
  const finish = (blockedBy: string, direction: Direction | null): SetupVerdict => {
    const gates = ORDER.map((id) => results.get(id) ?? WAIT(id))
    return { status: 'wait', blockedBy, direction, gates, vetoes: vetoResults, score: score(gates, vetoResults, false) }
  }

  // 1. Bias → direction
  const b = bias(ctx, config)
  results.set('h1-m15-bias', b.result)
  if (b.result.status !== 'pass' || b.direction === null) return finish('h1-m15-bias', b.direction)
  const direction = b.direction

  // 2. Structure
  const s = structure(ctx.h1, direction)
  results.set('market-structure', s)
  if (s.status !== 'pass') return finish('market-structure', direction)

  // 3. Consolidation (fail = NO-TRADE; only `pass` proceeds)
  const con = consolidation(ctx.m5, config)
  results.set('consolidation', con)
  if (con.status !== 'pass') return finish('consolidation', direction)

  // 4. Level-ID
  const lvl = levelId(ctx.m5, direction)
  results.set('level-id', lvl.result)
  if (lvl.result.status !== 'pass' || lvl.level === null) return finish('level-id', direction)
  const level = lvl.level

  // 5. Breakout close
  const brk = breakoutClose(ctx.m5, level, direction, config)
  results.set('breakout-close', brk)
  if (brk.status !== 'pass') return finish('breakout-close', direction)

  // 6. Retest
  const rt = retest(ctx.m5, level, direction, config)
  results.set('retest', rt)
  if (rt.status !== 'pass') return finish('retest', direction)

  // 7. Confirmation
  const cf = confirmation(ctx.m5, direction)
  results.set('confirmation', cf)
  if (cf.status !== 'pass') return finish('confirmation', direction)

  // 8. Risk:reward — entry = last close; SL = the broken level (structural); TP from R multiples.
  const last = ctx.m5[ctx.m5.length - 1]!
  const entry = last.close
  const sl = level
  const slDistance = Math.abs(entry - sl)
  const { tp1, tp2 } = takeProfits(entry, slDistance, direction)
  const rr = riskReward(entry, sl, tp2, direction, config)
  results.set('risk-reward', rr)
  if (rr.status !== 'pass') return finish('risk-reward', direction)

  const gates = ORDER.map((id) => results.get(id)!)
  const vetoed = vetoResults.some((v) => v.status === 'fail')
  if (vetoed) return finish('veto', direction)

  const lot = positionSize(config.accountSize, config.riskPct, slDistance, config.contractSize)
  return { status: 'setup', direction, level, entry, sl, tp1, tp2, lot, gates, vetoes: vetoResults, score: score(gates, vetoResults, true) }
}
