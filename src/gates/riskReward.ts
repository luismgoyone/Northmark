import type { Config, Direction, GateResult } from '../types'

/**
 * Risk:Reward gate (checklist step 11). Direction-aware:
 *   long  → risk = entry − sl, reward = tp − entry
 *   short → risk = sl − entry, reward = entry − tp
 * Passes iff reward/risk ≥ config.minRR with both distances > 0. Degenerate inputs
 * (wrong-side stop/target) → `fail`, never a divide-by-zero or false pass.
 */
export function riskReward(entry: number, sl: number, tp: number, direction: Direction, config: Config): GateResult {
  const id = 'risk-reward'
  const risk = direction === 'long' ? entry - sl : sl - entry
  const reward = direction === 'long' ? tp - entry : entry - tp
  const minRR = config.minRR

  if (risk <= 0) return { id, status: 'fail', detail: `Invalid risk ${risk} ≤ 0 for a ${direction} setup (sl on the wrong side of entry).` }
  if (reward <= 0) return { id, status: 'fail', detail: `Invalid reward ${reward} ≤ 0 for a ${direction} setup (tp on the wrong side of entry).` }

  const rr = reward / risk
  return rr >= minRR
    ? { id, status: 'pass', detail: `R:R ${rr.toFixed(2)} (reward ${reward} / risk ${risk}) ≥ ${minRR}.` }
    : { id, status: 'fail', detail: `R:R ${rr.toFixed(2)} (reward ${reward} / risk ${risk}) < ${minRR}.` }
}
