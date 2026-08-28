// executor/pipeline.ts
import type { PositionState } from './types.js'
import type { AcceptanceRecord, Executor, Store } from './ports.js'
import { ExecError } from './errors.js'
import { parseSignal } from './parse.js'
import { classify } from './classify.js'
import { applyEvent } from './state.js'
import { validateEntry } from './validate.js'

export type Deps = { store: Store; executor: Executor; secret: string; now: number }

/**
 * Orchestrate one webhook: appendRaw → auth → parse → dedupe → classify → state → validate → stub-execute → appendAcceptance.
 * NEVER throws: every path returns an AcceptanceRecord with an explicit outcome + reason.
 */
export async function handleSignal(rawBody: string, deps: Deps): Promise<AcceptanceRecord> {
  const { store, executor, secret, now } = deps

  let eventId = 'unknown'
  let symbol = 'unknown'
  const events: string[] = []
  let stateBefore: PositionState = 'FLAT'
  let stateAfter: PositionState = 'FLAT'

  const build = (outcome: AcceptanceRecord['outcome'], reason: string): AcceptanceRecord => ({
    eventId, receivedAt: now, symbol, events, outcome, reason, stateBefore, stateAfter,
  })
  // Persist the acceptance record but never let a store failure escape handleSignal.
  const commit = async (rec: AcceptanceRecord): Promise<AcceptanceRecord> => {
    try { await store.appendAcceptance(rec) } catch { /* logging must not turn into a throw */ }
    return rec
  }

  try {
    // 1) Raw log — always, before anything can reject.
    try { await store.appendRaw(rawBody) } catch { /* best-effort raw log */ }

    // Read current position once for the record's before/after fields.
    stateBefore = await store.getState()
    stateAfter = stateBefore

    // 2) Parse the envelope (need the secret + the payload).
    let parsed: unknown
    try { parsed = JSON.parse(rawBody) } catch {
      return commit(build('REJECTED', 'DATA: body is not valid JSON'))
    }

    // 3) Auth — reject on secret mismatch WITHOUT processing.
    const bodySecret = typeof (parsed as { secret?: unknown }).secret === 'string' ? (parsed as { secret: string }).secret : undefined
    if (bodySecret !== secret) {
      return commit(build('REJECTED', 'SIGNAL: auth failed — secret mismatch'))
    }

    // 4) Parse → typed Signal.
    const sig = parseSignal(parsed)
    eventId = sig.eventId
    symbol = sig.symbol

    // 5) Dedupe — duplicate event_id changes no state.
    if (await store.seen(eventId)) {
      return commit(build('DUPLICATE', 'duplicate event_id — already processed'))
    }

    // 6) Classify + apply each event, threading state; validate/execute per event.
    const evs = classify(sig)
    let st = stateBefore
    for (const ev of evs) {
      st = applyEvent(st, ev)
      if (ev.isEntry) {
        const order = validateEntry(ev, sig)
        const outcome = await executor.openPosition(order, eventId)
        try { await store.appendBroker({ eventId, event: ev.type, mode: 'stub', order, outcome, at: now }) } catch { /* best-effort */ }
      } else {
        const outcome = await executor.closePosition(ev.direction, eventId)
        try { await store.appendBroker({ eventId, event: ev.type, mode: 'stub', direction: ev.direction, outcome, at: now }) } catch { /* best-effort */ }
      }
      events.push(ev.type)
    }

    // 7) Persist the advanced state, then accept.
    stateAfter = st
    await store.setState(st)
    return commit(build('ACCEPTED', `ok — ${events.join(', ')}`))
  } catch (err) {
    if (err instanceof ExecError) return commit(build('REJECTED', `${err.category}: ${err.message}`))
    return commit(build('REJECTED', `STRATEGY: ${err instanceof Error ? err.message : String(err)}`))
  }
}
