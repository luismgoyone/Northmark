# Northmark

A decision dashboard, paper-trading simulator, and demo execution bot for an **XAUUSD (gold)
M5** trading strategy. Northmark has three parts:

1. **Dashboard.** It watches the live market, runs Luis' checklist as an objective,
   machine-testable gate sequence, and shows one of two states: **wait**, or **this is a
   setup**, with the entry, stop, targets, and lot the setup implies.
2. **Paper sim.** A server-side tick runs the engine every 5 minutes and records the paper
   trades it would have taken. This lets the strategy build a track record before real money
   is involved.
3. **Executor.** It receives the signals fired by the TradingView **V2.7.1** strategy, then
   validates, records, and audits them. Paper mode is the default. It can place orders on an
   MT5 **demo** account, but only when that is explicitly enabled.

## What it does

The strategy is the classic breakout-and-retest sequence, encoded verbatim from
[`docs/checklist.md`](docs/checklist.md):

> **H1 Bias → Structure → No Consolidation → Level ID → Breakout Close → Retest → Confirmation → Entry**

Each step is a pure **gate**. Gates run in order; the first one that isn't satisfied is what
you're *waiting on*. When every gate passes and no veto fires, the setup is live and the trade
card shows the concrete numbers:

- **Entry** — only after breakout → retest → confirmation, never on the initial breakout.
- **Stop loss** — beyond the structural invalidation point, not a fixed distance.
- **Take profit** — the next significant opposing level, targeting ≈ 1 : 1.5 R:R where the
  setup allows.
- **Lot** — sized from predetermined risk (never increased to recover a loss).

A separate **no-trade veto** panel surfaces the disqualifiers — wick-only breakout, failed
retest, consolidation, flat EMA, over-extended candle, insufficient TP room, oversized SL —
each shown as cleared / monitoring / active.

## How it's built

Northmark is a Vite + React + TypeScript (strict) single-page app styled with Tailwind. The
core discipline is a hard **purity boundary**:

```
data (I/O)  →  indicators  →  gates  →  scoring/risk  →  UI
  impure          pure         pure        pure          React
```

- **`src/data/`** — the *only* module allowed to touch the network. Fetches XAU/USD OHLC bars
  (M5/M15/H1) from Twelve Data and normalizes them into canonical `Candle[]`.
- **`src/indicators/`** — pure math: EMA, stochastic, swing points.
- **`src/gates/`** — one pure function per checklist step (bias, structure, consolidation,
  level-id, breakout-close, retest, confirmation, risk-reward).
- **`src/scoring/`** — `evaluateSetup` runs the gate sequence into a single `SetupVerdict`,
  plus vetoes, position sizing, and take-profit logic.
- **`src/hooks/useMarketData.ts`** — the one impure bridge into React: polls each timeframe on
  its own aligned cadence (M5→5m, M15→15m, H1→60m) to stay under the Twelve Data free-tier
  credit cap, and retains the last good data on a failed refresh.
- **`src/ui/`** — the dashboard, organized in tabs: **Signal** (score, trade card, vetoes),
  **Chart**, **Paper** (sim results), **TradingView** (paper record of V2.7.1 signals), and
  **Checklist**.
- **`src/sim/`, `src/edge/`, `src/serverTick.ts`** — the paper-trading engine. It handles
  trade simulation, stats, grading, session and news windows, and expectancy.

### Server side (Vercel functions + Upstash Redis)

| Endpoint | Purpose |
|---|---|
| `api/candles.ts` | Proxy to Twelve Data that keeps the API key out of the browser |
| `api/sim-tick.ts` | Advances the paper sim by one tick. Token-guarded; a GitHub Actions cron calls it every 5 minutes |
| `api/sim-state.ts` | Public read of the sim state for the Paper tab |
| `api/executor/webhook.ts` | Receives TradingView V2.7.1 alerts |
| `api/executor/paper-state.ts` | Paper record of the executor's signals for the TradingView tab |
| `api/executor/logs.ts`, `reconcile.ts` | Audit log, and a comparison of recorded positions against the broker |

### Executor (`executor/`)

The strategy logic lives in **TradingView**. The executor never recomputes gates, SL, or TP.
For each signal it:

- parses and validates the payload;
- drops duplicate event IDs;
- tracks position state as FLAT, LONG, or SHORT;
- maps the symbol to the broker's name and enforces a hard lot cap;
- executes the order, either as a paper trade (default) or on an MT5 demo via MetaApi, which
  is off by default;
- logs every decision with an explicit reason.

For setup, see [`docs/executor/`](docs/executor/), starting with the
[activation runbook](docs/executor/activation-runbook.md).

A **demo mode** (`src/demo/`) drives the whole engine from canned candle presets so you can
exercise every gate state without a live key.

## Getting started

```bash
npm install

# Twelve Data key — server-side only, never inlined into the client bundle.
cp .env.example .env.local        # then fill in TWELVEDATA_KEY

npm run dev                       # http://localhost:5173
```

Without a key, the app still runs in **demo mode**; live mode needs a valid
`TWELVEDATA_KEY`. Locally, `vite.config.ts` proxies API calls; in production the key is held
by the serverless proxy in [`api/candles.ts`](api/candles.ts) (deployed on Vercel).

Production-only environment variables, all set in Vercel and never committed:

| Variable | Used by |
|---|---|
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) | Sim and executor state |
| `SIM_TICK_SECRET` | Authenticates `api/sim-tick` (also stored as a GitHub Actions secret) |
| `NEWS_PROVIDER` / `NEWS_API_KEY` | Optional economic-calendar feed for the news veto |
| `WEBHOOK_SECRET` | Authenticates executor webhooks and logs |
| `METAAPI_TOKEN` / `METAAPI_ACCOUNT_ID` / `EXEC_ALLOW_LIVE` / `EXEC_MAX_LOT` / `EXEC_BROKER_SYMBOL` | MT5-demo execution. Opt-in; see the runbook |

## Deployment

Live at **https://northmark-one.vercel.app/**. Pushes to `main` do **not** deploy. To ship
to production, publish a GitHub Release (`gh release create vX.Y.Z`), which triggers
`.github/workflows/release.yml`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview the production build |
| `npm test` | Run the Vitest suite (watch) |
| `npm run test:run` | Run tests once |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (zero warnings allowed) |
| `npm run format` | Prettier |

## Project docs

- [`docs/checklist.md`](docs/checklist.md) — the verbatim strategy; source of truth for gate
  and veto behavior.
- [`docs/ui-spec.md`](docs/ui-spec.md) — visual and interaction spec.
- [`docs/executor/`](docs/executor/) — executor runbook, the TradingView alert handoff, and
  the V2.7.1 implementation package.
- [`NORTHMARK-STATUS.md`](NORTHMARK-STATUS.md) — current build status and backlog.

## Status & disclaimer

Northmark is under active development (see `NORTHMARK-STATUS.md`). Several numeric thresholds
are tagged **provisional** and still awaiting calibration against historical charts — do not
trust live sizing or signals until they're blessed. This is a personal decision-support and
forward-testing tool, **not financial advice**. The executor targets **demo** accounts and
refuses live accounts unless `EXEC_ALLOW_LIVE=true` is set explicitly.
