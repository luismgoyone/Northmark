/** Expectancy in R: E = win×rr − (1−win)×1, assuming a fixed 1R loss. */
export function expectancyR(winRate: number, rr: number): number {
  return winRate * rr - (1 - winRate) * 1
}

/** Win rate at which a given R:R breaks even: w* = 1 / (1 + rr). */
export function breakevenWinRate(rr: number): number {
  return 1 / (1 + rr)
}
