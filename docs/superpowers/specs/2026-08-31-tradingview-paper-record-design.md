# TradingView V2.7.1 Paper Record — Design

**Goal:** Record every V2.7.1 signal Northmark already receives from TradingView as a paper trade, and show the running win-rate / R / real-$-at-0.01-lot in a new **TradingView** tab — free, no MetaApi.

**Status:** approved (brainstorming). Terminal → writing-plans → subagent/inline build → release.

## Boundary (unchanged)

TradingView V2.7.1 = strategy brain (owns entries/exits/SL/TP/RR). Northmark = execution + audit. This feature adds a **paper execution** mode: instead of a broker, the mirrored signals drive a paper ledger. No strategy logic in Northmark.

## Architecture

A third `Executor` implementation, `PaperExecutor`, rides the **existing, proven** signal pipeline (dedupe + FLAT/LONG/SHORT state machine). It becomes the **default when no broker is enabled**, replacing the no-op `StubExecutor` — so it is on by default, free, and needs no MetaApi.

```
TradingView → /api/executor/webhook → handleSignal (parse→auth→dedupe→classify→state→validate)
   → PaperExecutor.openPosition / closePosition  → Redis (exec:paper:v1)
/api/executor/paper-state (public read) → maps PaperAccount → SimState → useExecutorPaper hook → SimPanel in the new TradingView tab
```

## Data model (executor/types.ts)

```
PaperOpen  = { eventId, direction:'long'|'short', entry, sl, tp, lot, risk, openedAt }
PaperTrade = PaperOpen & { exit, closedAt, rMultiple, pnl, result:'win'|'loss' }
PaperAccount = { startingBalance, balance, open: PaperOpen|null, trades: PaperTrade[] }
```

- `risk` = |entry−sl| × contractSize × lot (dollar risk at the paper lot).
- `pnl`  = (exit−entry) × dir × contractSize × lot  (= risk × rMultiple; dir = +1 long / −1 short).
- `rMultiple` = (exit−entry) × dir / |entry−sl|.  `result` = pnl ≥ 0 ? win : loss.
- Constants: `PAPER_START = 100` (nominal balance for return %), `CONTRACT_SIZE = 100` (XAUUSD oz/lot → $1 per $1 move at 0.01 lot, matching the broker).

## PaperExecutor (executor/paper.ts)

- Implements `Executor`. Constructor `(store, { contractSize?, now? })`; `now` injectable for tests (default `Date.now`).
- `openPosition(order, eventId)`: if a position is already open → no-op (state machine prevents this anyway). Else record `open` with computed `risk`, `openedAt = now()`. Returns `{status:'paper', detail}`.
- `closePosition(direction, eventId, exitPrice?)`: if no open → no-op. If `exitPrice` missing/non-finite → no-op detail (cannot finalize). Else finalize the open into a `PaperTrade`, push, `balance += pnl`, clear `open`.
- Reversals already arrive as `[EXIT, ENTRY]`, so the account flips correctly. Dedupe is upstream → no double-record.

## Port + wiring changes

- `ports.ts`: `ExecOutcome.status` gains `'paper'`; `closePosition` gains optional `exitPrice?: number` (Stub/MetaApi ignore it — assignable). `Store` gains `getPaper()` / `setPaper()`.
- `logs.ts` `redisStore`: `getPaper` (→ `emptyAccount()` when unset) / `setPaper` on key `exec:paper:v1`.
- `pipeline.ts`: pass the exit price to `closePosition(ev.direction, eventId, sig.entry)` — on a flat event `sig.entry` is the bar close; on a reversal it's the flip price. (Approximation of V2.7.1's real SL/TP/profit-lock exit — documented.)
- `api/executor/webhook.ts`: hoist `store`; executor = `gate.enabled ? MetaApiExecutor : new PaperExecutor(store)`; response `mode = gate.enabled ? 'live-demo' : 'paper'`.

## API + adapter

- `src/sim/fromPaper.ts`: pure `paperToSimState(acct): SimState` — maps PaperTrade→SimTrade (`riskCredits=risk`, `pnlCredits=pnl`, `rr=|tp−entry|/|entry−sl|`, `exitReason = rMultiple≥0?'tp':'sl'`, times), open→SimPosition, `nextId = trades.length+1`. Reuses the existing `simStats`. (Type-only import of PaperAccount; keeps executor free of src.)
- `api/executor/paper-state.ts`: **public** read (trade data only, no secrets — safe like `/api/sim-state`). Returns `{ state: paperToSimState(store.getPaper()), meta: { limitReachedAt:null, updatedAt: Date.now(), newsUpdatedAt:null, newsActive:false } }`, `Cache-Control: no-store`. Empty account when Redis unset (never 500).

## Frontend

- `src/hooks/useExecutorPaper.ts`: fetch `/api/executor/paper-state` on mount + 60s poll, keep-last-good, never throw. Returns `{ state, stats: simStats(state), meta, loading }`.
- `src/App.tsx`: add tab `tradingview` (label **"TradingView"** — avoids colliding with the existing singular **"Signal"** tab). Renders a labeled section header ("DAD + ChatGPT · V2.7.1 from TradingView") + `<SimPanel state stats meta />`. **Not** gated on Live/backtest mode (reflects real signals + server state). Paper / Signal / Checklist tabs untouched.

## Testing

- `executor/paper.test.ts`: open→close win/loss, short mirror, R + $ math, reversal (close then open), close-with-no-open no-op, missing exit price no-op. Uses an in-memory `Store` fake.
- `src/sim/fromPaper.test.ts`: mapping correctness (fields, empty account, open position, nextId).
- All TDD, `--max-warnings 0` clean.

## Out of scope

No backfill of existing signals (they include test probes) — the record starts at deploy. Signal/Checklist tabs keep Northmark's own "dad" engine. Fill-price precision and always-on paper-while-broker-enabled are later enhancements.
