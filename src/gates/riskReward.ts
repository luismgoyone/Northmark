import type { Config, GateResult } from '../types'

/**
 * Risk:Reward gate (MVP §4, deterministic).
 *
 * For a long setup:
 *   reward = tp - entry   (distance up to the target)
 *   risk   = entry - sl   (distance down to the stop)
 *
 * Passes iff `reward / risk >= config.minRR` (default 1.5).
 *
 * Degenerate inputs bias toward non-pass — never a false `pass` and never a
 * divide-by-zero:
 *   - risk <= 0   (sl at/above entry)  → no valid stop below entry yet
 *   - reward <= 0 (tp at/below entry)  → no valid target above entry yet
 * SL is structural (supplied by the caller); this gate only measures the ratio.
 */
export function riskReward(entry: number, sl: number, tp: number, config: Config): GateResult {
  const id = 'risk-reward'
  const risk = entry - sl
  const reward = tp - entry
  const minRR = config.minRR

  if (risk <= 0) {
    return {
      id,
      status: 'fail',
      detail: `Invalid risk: sl ${sl} is not below entry ${entry} (risk ${risk} ≤ 0). No valid stop yet; cannot evaluate R:R against threshold ${minRR}.`,
    }
  }

  if (reward <= 0) {
    return {
      id,
      status: 'fail',
      detail: `Invalid reward: tp ${tp} is not above entry ${entry} (reward ${reward} ≤ 0). No valid target yet; cannot evaluate R:R against threshold ${minRR}.`,
    }
  }

  const rr = reward / risk

  if (rr >= minRR) {
    return {
      id,
      status: 'pass',
      detail: `R:R ${rr} (reward ${reward} / risk ${risk}) ≥ threshold ${minRR}.`,
    }
  }

  return {
    id,
    status: 'fail',
    detail: `R:R ${rr} (reward ${reward} / risk ${risk}) < threshold ${minRR}.`,
  }
}
