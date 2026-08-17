import type { Config, Direction, GateResult, MarketContext } from '../types'
import { ema } from '../indicators/ema'
import { structureDirection } from './structure'

/**
 * Primary bias from H1 structure. EMA9 slope may SUPPORT but never OVERRIDE clear
 * structure (checklist step 1): we only veto when EMA9 slope strongly opposes the
 * structural direction (rising structure + falling EMA9, or vice versa).
 */
export function bias(ctx: MarketContext, config: Config): { result: GateResult; direction: Direction | null } {
  const id = 'h1-m15-bias'
  const direction = structureDirection(ctx.h1)

  if (direction === null) {
    return { result: { id, status: 'wait', detail: 'H1 direction is unclear (no clean HH/HL or LH/LL). No trade.' }, direction: null }
  }

  const { slope } = ema(ctx.h1, config.ema.period)
  const contradicts = (direction === 'long' && slope === 'falling') || (direction === 'short' && slope === 'rising')
  if (contradicts) {
    return { result: { id, status: 'wait', detail: `H1 structure is ${direction} but EMA9 slope (${slope}) strongly disagrees. No trade.` }, direction: null }
  }

  return { result: { id, status: 'pass', detail: `H1 bias ${direction}; EMA9 slope ${slope} supports (or is neutral).` }, direction }
}
