// Money math — highest scrutiny. Pure module, no I/O.
//
// SL distance is a POSITIVE price distance the caller derives from structure
// (retest / swing low), never back-solved from a desired dollar loss. These
// functions consume that distance; they never invent an SL from a $ target.

import type { Direction } from '../types.js'

/**
 * Lot size for a fixed-fractional risk model.
 *
 *   lot = (accountSize * riskPct) / (slDistance * contractSize)
 *
 * Guards `slDistance <= 0` and `contractSize <= 0` → returns 0, so we never
 * divide by zero nor emit a negative / absurd lot. Also hard-fails to 0 on
 * any non-finite input (NaN/Infinity) so a corrupted upstream value never
 * slips through to a NaN/Infinity lot.
 */
export function positionSize(
  accountSize: number,
  riskPct: number,
  slDistance: number,
  contractSize: number,
): number {
  const inputs = [accountSize, riskPct, slDistance, contractSize]
  if (inputs.some((n) => !Number.isFinite(n))) return 0
  if (slDistance <= 0 || contractSize <= 0) return 0
  const riskDollars = accountSize * riskPct
  return riskDollars / (slDistance * contractSize)
}

/**
 * Take-profit targets, direction-aware.
 *
 *   long  → tp1 = entry + 1.0 * slDistance, tp2 = entry + 2.0 * slDistance
 *   short → tp1 = entry - 1.0 * slDistance, tp2 = entry - 2.0 * slDistance
 *   (TP1 = 1.0R is a product-lead Tier-2 decision, not a checklist-derived value.)
 *
 * Structure overrides math: if `nextSR` is defined and sits closer than a
 * computed target, cap that target to `nextSR` (long: nextSR below target;
 * short: nextSR above target). When `nextSR` is undefined, no cap is applied.
 */
export function takeProfits(
  entry: number,
  slDistance: number,
  direction: Direction,
  nextSR?: number,
): { tp1: number; tp2: number } {
  const sign = direction === 'long' ? 1 : -1
  let tp1 = entry + sign * 1.0 * slDistance
  let tp2 = entry + sign * 2.0 * slDistance

  if (nextSR !== undefined) {
    if (direction === 'long') {
      if (nextSR < tp1) tp1 = nextSR
      if (nextSR < tp2) tp2 = nextSR
    } else {
      if (nextSR > tp1) tp1 = nextSR
      if (nextSR > tp2) tp2 = nextSR
    }
  }

  return { tp1, tp2 }
}
