# XAUUSD V2.7.1 Execution Bot — Design Spec

**Date:** 2026-08-29
**Status:** Approved for planning (Phase 1)
**Source strategy:** `XAUUSD_V2.7.1_Final_Strategy_AI_Handoff` (Dad + ChatGPT handoff)

## Purpose

A backend **execution bot** that reliably and auditably mirrors the working TradingView **V2.7.1** strategy onto an **MT5 demo account (via MetaApi)**. It solves the exact failure the handoff describes — *"webhook delivered ≠ order executed"* (Elirox rejected signals silently) — by making every stage observable: receive → log → classify → validate → execute → log the broker result, with **no silent failures, no forced trades, demo-only**.

This is a **separate subsystem** living in the Northmark repo under `executor/` + `api/executor/`. It does **not** touch the Northmark paper-trading dashboard.

### Core principle — faithful mirror, not a second strategy
TradingView's V2.7.1 Pine script is the source of truth for signals **and** exits (it owns H1/M15/M5/breakout/stochastic detection, ATR stops, 1:1.2 RR, and the profit-protection SL logic). The bot does **not** re-run the strategy or manage stops. It **mirrors** each alert:
- **Entry alert** → open the MT5 position with the SL/TP TradingView already computed (carried in the payload).
- **Exit alert** → close that MT5 position.

Profit-protection and all risk math stay inside TradingView; the bot executes and audits.

## Non-goals (explicitly out of scope)
- Re-implementing the V2.7.1 strategy in code (TradingView owns it).
- Elirox integration (demoted to a manual reference per the handoff).
- **Live trading** — demo only during development; a hard gate refuses non-demo accounts.
- Any change to the Northmark paper dashboard.
- Bot-side stop management / trailing (TradingView fires the exit; the bot mirrors it).

## Decisions (locked with the user)
- **Signal source:** TradingView webhook (existing, working Pine V2.7.1).
- **Broker:** MT5 demo via **MetaApi** (cloud).
- **SL/TP + lot source:** the **extended TradingView alert payload** (zero divergence from TradingView).
- **Location:** a new folder inside the Northmark repo (shared Vercel project + Upstash Redis; namespaced `exec:*`).

## Architecture

```
TradingView V2.7.1 (Pine)
   │  alert JSON: { secret, event_id, action, market_position, prev_market_position,
   │               symbol, entry, sl, tp, lot, setup_strength, timestamp }
   ▼
POST /api/executor/webhook
   │
   ├─ ① Raw Signal Logger  — persist the verbatim body FIRST, always (even if later rejected)
   ├─ ② Auth               — shared secret (URL ?token= and/or payload secret); reject otherwise
   ├─ ③ Parser             — validate/normalize the JSON into a typed Signal
   ├─ ④ Classifier         — event ∈ { LONG_ENTRY, SHORT_ENTRY, LONG_EXIT, SHORT_EXIT }
   │                          derived from action + market_position + prev_market_position
   ├─ ⑤ Dedupe             — event_id seen before → IGNORE (logged); else record (TTL)
   ├─ ⑥ State Machine      — FLAT/LONG/SHORT; validate the transition (no pyramiding;
   │                          opposite-direction handled explicitly: close then open)
   ├─ ⑦ Validation         — SL/TP on the correct side of entry; symbol map XAUUSD→broker;
   │                          lot conversion (TV qty → broker lot, e.g. 0.01); bounds checks
   ├─ ⑧ Executor           — Phase 1: STUB (logs "would execute"); Phase 2: MetaApi order
   └─ ⑨ Acceptance Logger  — RECEIVED→PARSED→CLASSIFIED→ACCEPTED/REJECTED + explicit reason
   ▼
Broker Execution Logger (Phase 2) — order sent, broker response, ticket, fill price, SL, TP, status/errors
```

### Modules (pure where possible, TDD)
| Module | Responsibility | Purity |
|---|---|---|
| `executor/schema.ts` | The `Signal` type + payload schema (Zod-style or hand-rolled guards) | pure |
| `executor/parse.ts` | Raw body → typed `Signal` or a typed `ParseError` | pure |
| `executor/classify.ts` | `Signal` → `SignalEvent[]` (usually one; a reversal yields `[EXIT, ENTRY]`); reason on ambiguity | pure |
| `executor/dedupe.ts` | Event identity (from event_id / timestamp+symbol+action) + seen-check contract | pure core + Redis adapter |
| `executor/state.ts` | Position state machine: current state + a proposed event → next state or a typed rejection | pure |
| `executor/validate.ts` | SL/TP side checks, symbol mapping, lot conversion, bounds | pure |
| `executor/errors.ts` | The error taxonomy (SIGNAL/DATA/STRATEGY/POSITION/RISK/SYMBOL/LOT/BROKER/DUPLICATE) | pure |
| `executor/logs.ts` | Structured log records + Redis append/read (namespaced `exec:*`) | I/O |
| `executor/executor.ts` | The stub executor (Phase 1) behind an `Executor` interface | pure stub |
| `executor/metaapi.ts` | The MetaApi `Executor` implementation (Phase 2) | I/O |
| `api/executor/webhook.ts` | Vercel handler wiring the pipeline | I/O |
| `api/executor/logs.ts` | Read-only JSON/HTML diagnostics view of the logs | I/O |

### Storage (Upstash Redis, `exec:*`)
- `exec:raw` — list of verbatim inbound bodies (capped).
- `exec:acceptance` — list of acceptance records (per-signal decision trail).
- `exec:broker` — list of broker execution records (Phase 2).
- `exec:position` — current position state ({ state, direction, ticket, entry, sl, tp, openedAt }).
- `exec:seen` — dedupe set/keys with TTL.

### Security & safety
- Webhook authenticated by a shared secret (`WEBHOOK_SECRET`), checked before any processing beyond the raw log.
- MetaApi token + account id in env (`METAAPI_TOKEN`, `METAAPI_ACCOUNT_ID`).
- **Demo-only hard gate:** before any order, verify the MetaApi account `type`/`login` is a **demo**; refuse and log a `BROKER` error otherwise. A config flag `EXEC_ENABLED` must be explicitly true for Phase 2 to place orders (defaults false).
- No forced trades: the bot never invents a signal; it only acts on received, validated alerts.

## The extended alert payload (Pine prerequisite)
The user extends the V2.7.1 `alert()` JSON to include the levels TradingView already computes. Recommended schema:
```json
{
  "secret": "<shared secret>",
  "event_id": "{{timenow}}-{{ticker}}-{{strategy.order.action}}",
  "timestamp": "{{timenow}}",
  "symbol": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "market_position": "{{strategy.market_position}}",
  "prev_market_position": "{{strategy.prev_market_position}}",
  "entry": "{{close}}",
  "sl": "<pine var: protected/initial SL>",
  "tp": "<pine var: longTP/shortTP>",
  "lot": "0.01",
  "setup_strength": "<weak|normal|strong|very_strong>"
}
```
Phase 1 tolerates missing `sl`/`tp`/`setup_strength` (logs them as warnings, still classifies) so development can proceed before the Pine change lands. Phase 2 requires `sl`/`tp` for entries (else a `RISK` rejection).

## Classification rules
- `action = buy` & `market_position = long` & `prev = flat` → **LONG_ENTRY**
- `action = sell` & `market_position = short` & `prev = flat` → **SHORT_ENTRY**
- `market_position = flat` & `prev = long` → **LONG_EXIT**
- `market_position = flat` & `prev = short` → **SHORT_EXIT**
- `prev = long` & `market_position = short` (or vice-versa) → **reversal**: emit EXIT then ENTRY (state machine handles close-then-open).
- Anything else → classified as ambiguous → `SIGNAL` error, logged, not executed.

## Phasing

- **Phase 1 — Reception + diagnostics (NO broker).**
  All pure modules (schema/parse/classify/dedupe/state/validate/errors), Redis logging, the stub executor behind the `Executor` interface, the webhook handler, and the read-only diagnostics view. Every stage logged with explicit reasons. *Deliverable: send a test webhook and watch it flow RECEIVED→…→ACCEPTED/REJECTED with the classified event, dedupe, state transition, and "would execute" — end to end, zero broker risk.*

- **Phase 2 — MetaApi MT5-demo execution.**
  `executor/metaapi.ts` implementing the `Executor` interface: connect, submit market order with SL/TP, close position on exit, capture ticket/fill/errors → `exec:broker`. Demo-only hard gate + `EXEC_ENABLED` flag. Swap the stub for the real executor in the handler. *Deliverable: a demo entry alert opens a real MT5-demo position with the right SL/TP/lot; an exit alert closes it; every broker response is logged.*

- **Phase 3 — Reconciliation + safety.**
  Compare TradingView vs bot vs broker (entry/SL/TP/exit) per handoff §28 Phase 4; a reconcile cron detecting drift / orphaned positions; the full acceptance-test cycle (§30) visible in logs. *Deliverable: the complete cycle is auditable and discrepancies are surfaced, not silent.*

## Infra the user provides
- **Phase 1:** nothing (works with a shared secret env var). Optional: the Pine payload change to send real levels.
- **Phase 2:** a **MetaApi account + token**, an **MT5 demo account** (broker login/password/server) linked to MetaApi, and the env vars set in Vercel. Confirm MetaApi pricing for demo usage.

## Testing
- Every pure module is TDD'd (Vitest), mirroring Northmark's engine tests: parse (valid/invalid/missing fields), classify (each event + reversal + ambiguous), dedupe (first vs duplicate), state machine (every valid/invalid transition), validate (SL/TP wrong-side, symbol map, lot convert, bounds), errors (taxonomy).
- Handler tests with a fake `Executor` assert the full pipeline + acceptance-log records, including rejection reasons (auth fail, duplicate, bad transition, missing SL/TP in Phase 2).
- Phase 2: the MetaApi adapter is integration-tested against a demo account behind a flag (not in the default suite), plus unit tests of the request/response mapping with a mocked MetaApi client.

## Open questions (non-blocking)
- Exact MetaApi SDK surface for market-order-with-SL/TP and position-close (resolved during Phase 2 planning).
- Log retention/caps and whether to graduate from Redis lists to a queryable store later (Phase 3+).
