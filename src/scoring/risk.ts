// Money math — highest scrutiny. Pure module, no I/O.
//
// SL distance is a POSITIVE price distance the caller derives from structure
// (retest / swing low), never back-solved from a desired dollar loss. These
// functions consume that distance; they never invent an SL from a $ target.

/**
 * Lot size for a fixed-fractional risk model.
 *
 *   lot = (accountSize * riskPct) / (slDistance * contractSize)
 *
 * Guards `slDistance <= 0` and `contractSize <= 0` → returns 0, so we never
 * divide by zero nor emit a negative / absurd lot.
 */
export function positionSize(
  accountSize: number,
  riskPct: number,
  slDistance: number,
  contractSize: number,
): number {
  if (slDistance <= 0 || contractSize <= 0) return 0
  const riskDollars = accountSize * riskPct
  return riskDollars / (slDistance * contractSize)
}

/**
 * Take-profit targets for a LONG setup.
 *
 *   tp1 = entry + 1.0 * slDistance   (TP1 = 1.0R — product-lead Tier-2 decision)
 *   tp2 = entry + 2.0 * slDistance   (TP2 = 2R)
 *
 * Structure overrides math: if `nextSR` is defined and sits closer than a
 * computed target (nextSR < target for a long), cap that target to `nextSR`.
 * When `nextSR` is undefined, no cap is applied.
 */
export function takeProfits(
  entry: number,
  slDistance: number,
  nextSR?: number,
): { tp1: number; tp2: number } {
  let tp1 = entry + 1.0 * slDistance
  let tp2 = entry + 2.0 * slDistance

  if (nextSR !== undefined) {
    if (nextSR < tp1) tp1 = nextSR
    if (nextSR < tp2) tp2 = nextSR
  }

  return { tp1, tp2 }
}
