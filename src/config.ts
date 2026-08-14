import type { Config } from './types'

export const defaultConfig: Config = {
  instrument: 'XAUUSD',
  accountSize: 200,
  riskPct: 0.01,
  // contractSize: XAUUSD pip→dollar convention pending confirmation with Luis at the phase boundary.
  contractSize: 100,
  ema: { period: 9 },
  minRR: 1.5,

  // Tunable Tier-2 defaults (bias-toward-WAIT); product-lead may recalibrate.
  stoch: { k: 14, d: 3, smooth: 3, overbought: 80, oversold: 20 },

  // Tunable Tier-2 defaults (bias-toward-WAIT). retestBand is a fraction of price;
  // breakoutBufferPips is in pips (XAUUSD pip→dollar convention pending confirmation
  // with Luis at the phase boundary); consolidationLookback is in candles.
  tolerances: { retestBand: 0.0005, breakoutBufferPips: 20, consolidationLookback: 20 },
}
