// executor/reconcile.ts
import type { PositionState } from './types.js'
export type BrokerPosition = { symbol: string; direction: 'long' | 'short'; volume: number }
export type Drift =
  | { kind: 'bot_has_no_broker_position'; botState: 'LONG' | 'SHORT' }
  | { kind: 'broker_has_unexpected_position'; position: BrokerPosition }
  | { kind: 'direction_mismatch'; botState: 'LONG' | 'SHORT'; position: BrokerPosition }
  | { kind: 'multiple_broker_positions'; count: number }
export type ReconcileReport = { inSync: boolean; botState: PositionState; brokerCount: number; drift: Drift[] }

export function reconcile(botState: PositionState, positions: BrokerPosition[]): ReconcileReport {
  const drift: Drift[] = []
  if (positions.length > 1) drift.push({ kind: 'multiple_broker_positions', count: positions.length })

  if (botState === 'FLAT') {
    for (const p of positions) drift.push({ kind: 'broker_has_unexpected_position', position: p })
  } else {
    const want: 'long' | 'short' = botState === 'LONG' ? 'long' : 'short'
    if (positions.length === 0) {
      drift.push({ kind: 'bot_has_no_broker_position', botState })
    } else {
      for (const p of positions) {
        if (p.direction !== want) drift.push({ kind: 'direction_mismatch', botState, position: p })
      }
    }
  }
  return { inSync: drift.length === 0, botState, brokerCount: positions.length, drift }
}
