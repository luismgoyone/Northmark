// executor/ports.ts
import type { BrokerOrder, PaperAccount, PositionState } from './types.js'

export type ExecOutcome = { status: 'stub' | 'sent' | 'error' | 'paper'; detail: string; ticket?: string; fill?: number }

export interface Executor {
  openPosition(order: BrokerOrder, eventId: string): Promise<ExecOutcome>
  // exitPrice is the price to close at (paper mode uses it; broker executors close at market and ignore it).
  closePosition(direction: 'long' | 'short', eventId: string, exitPrice?: number): Promise<ExecOutcome>
}

export type AcceptanceRecord = {
  eventId: string; receivedAt: number; symbol: string; events: string[]
  outcome: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE'; reason: string; stateBefore: string; stateAfter: string
}

export interface Store {
  appendRaw(body: string, at: number): Promise<void>
  appendAcceptance(rec: AcceptanceRecord): Promise<void>
  appendBroker(rec: unknown): Promise<void>
  appendReconcile(rec: unknown): Promise<void>
  getState(): Promise<PositionState>
  setState(s: PositionState): Promise<void>
  seen(eventId: string): Promise<boolean>   // true if already processed; records it if not
  recent(kind: 'raw' | 'acceptance' | 'broker' | 'reconcile', n: number): Promise<unknown[]>
  getPaper(): Promise<PaperAccount>          // paper ledger (empty account when unset)
  setPaper(account: PaperAccount): Promise<void>
}
