# Northmark

A read-only decision dashboard for a manually-tested **XAUUSD (gold) M5** trading strategy.
Northmark watches the live market, runs Luis' checklist as an objective, machine-testable
gate sequence, and tells you one thing at a glance: **wait**, or **this is a setup** (with the
entry, stop, targets, and lot it implies). It never places orders — it's a signal and
discipline tool, not a bot.

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
- **`src/ui/`** — the read-only dashboard: score header, price chart, trade card, veto list,
  and the checklist itself.

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
- [`NORTHMARK-STATUS.md`](NORTHMARK-STATUS.md) — current build status and backlog.

## Status & disclaimer

Northmark is under active development (see `NORTHMARK-STATUS.md`). Several numeric thresholds
are tagged **provisional** and still awaiting calibration against historical charts — do not
trust live sizing or signals until they're blessed. This is a personal decision-support tool,
**not financial advice** and **not an automated trading system**.
