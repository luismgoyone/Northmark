import type { Config } from '../types.js'
import type { SimConfig } from './types.js'

/** Starting paper balance in credits. */
export const SIM_STARTING_BALANCE = 10_000

/** Derive the sim config from the main engine config — risk mirrors the live risk %. */
export function simConfigFrom(config: Config): SimConfig {
  return { startingBalance: SIM_STARTING_BALANCE, riskPct: config.riskPct }
}
