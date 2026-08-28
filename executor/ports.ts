// executor/ports.ts
import type { BrokerOrder, PositionState } from './types.js'

export type ExecOutcome = { status: 'stub' | 'sent' | 'error'; detail: string; ticket?: string; fill?: number }

export interface Executor {
  openPosition(order: BrokerOrder, eventId: string): Promise<ExecOutcome>
  closePosition(direction: 'long' | 'short', eventId: string): Promise<ExecOutcome>
}

export type AcceptanceRecord = {
  eventId: string; receivedAt: number; symbol: string; events: string[]
  outcome: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE'; reason: string; stateBefore: string; stateAfter: string
}

export interface Store {
  appendRaw(body: string): Promise<void>
  appendAcceptance(rec: AcceptanceRecord): Promise<void>
  appendBroker(rec: unknown): Promise<void>
  getState(): Promise<PositionState>
  setState(s: PositionState): Promise<void>
  seen(eventId: string): Promise<boolean>   // true if already processed; records it if not
  recent(kind: 'raw' | 'acceptance' | 'broker', n: number): Promise<unknown[]>
}
