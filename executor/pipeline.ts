// executor/pipeline.ts
import type { BrokerOrder, PositionState, SignalEvent } from './types.js'
import type { AcceptanceRecord, Executor, ExecOutcome, Store } from './ports.js'
import { ExecError } from './errors.js'
import { parseSignal } from './parse.js'
import { classify } from './classify.js'
import { applyEvent } from './state.js'
import { validateEntry } from './validate.js'
import { redactSecret } from './redact.js'

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
    // 1) Raw log — always, before anything can reject. Redact the shared secret first:
    // the raw log is served by the diagnostics endpoint, so it must never carry the secret.
    try { await store.appendRaw(redactSecret(rawBody), now) } catch { /* best-effort raw log */ }

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

    // 6) Classify, then validate-ALL-legs-BEFORE-executing-ANY.
    //    Apply the state machine across every leg up front (throws POSITION on illegal
    //    transitions) and build+validate every entry order (throws RISK/LOT/SYMBOL).
    //    A throw here REJECTs before ANY broker action — so a reversal with a bad ENTRY
    //    never fires its EXIT leg.
    const evs = classify(sig)
    const orders = new Map<SignalEvent, BrokerOrder>()
    let st = stateBefore
    for (const ev of evs) {
      st = applyEvent(st, ev)
      if (ev.isEntry) orders.set(ev, validateEntry(ev, sig))
    }

    // 7) Execute legs in order (exits close, entries open). Log every broker outcome.
    //    On a broker error, stop further legs and reject (state below reflects only what applied).
    let applied = stateBefore
    for (const ev of evs) {
      let outcome: ExecOutcome
      if (ev.isEntry) {
        const order = orders.get(ev)!
        outcome = await executor.openPosition(order, eventId)
        try { await store.appendBroker({ eventId, event: ev.type, order, outcome, at: now }) } catch { /* best-effort */ }
      } else {
        outcome = await executor.closePosition(ev.direction, eventId)
        try { await store.appendBroker({ eventId, event: ev.type, direction: ev.direction, outcome, at: now }) } catch { /* best-effort */ }
      }
      if (outcome.status === 'error') {
        applied = applyEvent(applied, ev)
        events.push(ev.type)
        stateAfter = applied
        await store.setState(applied)
        return commit(build('REJECTED', `BROKER: ${ev.type} failed — ${outcome.detail}`))
      }
      applied = applyEvent(applied, ev)
      events.push(ev.type)
    }

    // 8) Persist the advanced state, then accept.
    stateAfter = applied
    await store.setState(applied)
    return commit(build('ACCEPTED', `ok — ${events.join(', ')}`))
  } catch (err) {
    if (err instanceof ExecError) return commit(build('REJECTED', `${err.category}: ${err.message}`))
    return commit(build('REJECTED', `STRATEGY: ${err instanceof Error ? err.message : String(err)}`))
  }
}
