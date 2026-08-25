import type { Config } from '../types.js'
import type { SimConfig } from './types.js'

/** Starting paper balance in USD (small, realistic account). */
export const SIM_STARTING_BALANCE = 200

/** Derive the sim config from the main engine config — risk % and contract size mirror live. */
export function simConfigFrom(config: Config): SimConfig {
  return {
    startingBalance: SIM_STARTING_BALANCE,
    riskPct: config.riskPct,
    contractSize: config.contractSize,
  }
}
