# Northmark MVP — Design

**Date:** 2026-08-14
**Status:** Approved (design), pending implementation plan
**Owner:** Luis

---

## 1. Summary

Northmark is a **forex trade-setup assistant**. For its MVP it focuses on a single
instrument and timeframe — **XAUUSD (gold) on the M5 chart** — and continuously
evaluates a fixed, rule-based entry checklist against live market data.

It is an **assistant, not a broker**: it scans, scores the checklist, and presents a
ready-to-use trade card (Entry / SL / TP1 / TP2 / Lot / R:R). **The user places the
trade in their own broker.** Northmark never holds money and never places orders.
This deliberately keeps the MVP out of regulated territory (no licensing, KYC/AML, or
custody of funds).

The checklist it encodes is the user's own XAUUSD M5 system (documented in
[Appendix A](#appendix-a--source-checklist)).

### Guiding principle (from the user's own rules)
> "I don't need to catch the beginning of the move. I need to catch the confirmed part
> of the move." — and — "A missed trade costs $0. A bad trade costs money."

The system is biased toward **WAIT** over false confidence.

---

## 2. Goals & Non-Goals

### Goals
- Encode the user's XAUUSD M5 checklist as a testable decision engine.
- Pull live M5/M15/H1 candles from a market-data API.
- Show a live checklist (✅ pass / ❌ fail / ⏳ waiting) with a confidence score.
- Enforce hard "NO-TRADE" veto conditions as blocking rules.
- Compute risk-first Stop Loss and position size from the user's formula.
- Present a trade card the user can act on manually.

### Non-Goals (explicitly out of scope for MVP)
- No order execution / auto-trading.
- No user accounts, auth, or money handling.
- No KYC/AML/custody/licensing.
- No assets other than XAUUSD; no timeframes other than M5 (with M15/H1 used only for
  bias context).
- No multi-user support — single user (the owner).

---

## 3. Architecture

Four cleanly separated layers plus a thin UI. Layers 2–4 are **pure functions with no
I/O**, so they are built test-first and verified against the user's rules before any
of it reaches a screen. A wrong gate = a wrong trade signal, so correctness is the
priority.

```
┌─────────────────────────────────────────────────────────┐
│ UI (React)  — live checklist, score, veto list, trade card│
└───────────────▲─────────────────────────────────────────┘
                │
┌───────────────┴───────────────┐
│ 4. Scoring + Risk layer        │  score, vetoes, SL-from-structure, lot size
├───────────────────────────────┤
│ 3. Gate engine                 │  one pure fn per checklist item
├───────────────────────────────┤
│ 2. Indicator layer             │  ema(9), stochastic(), swingPoints()
├───────────────────────────────┤
│ 1. Data layer                  │  fetch + normalize M5/M15/H1 candles
└───────────────────────────────┘
```

### Layer 1 — Data
- Fetch M5 + M15 + H1 candles for XAU/USD from a market-data API (default:
  **Twelve Data**; alternative: OANDA practice feed to mirror a real broker).
- Normalize every provider response to a common shape:
  ```ts
  type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number }
  ```
- Refresh on each M5 close (poll or websocket). Keep a rolling window sufficient for the
  longest lookback (swing structure, H1 bias).

### Layer 2 — Indicators (pure)
- `ema(candles, period)` — EMA9 value + slope (rising/flat/falling).
- `stochastic(candles, k, d, smooth)` — %K/%D values, zone, and slope (turning up/down).
- `swingPoints(candles)` — detected swing highs/lows for HH/HL / LH/LL structure.
- Fully unit-tested against known fixtures.

### Layer 3 — Gate engine (pure)
Each checklist item is a function:
```ts
type GateResult = { id: string; status: 'pass' | 'fail' | 'wait'; detail: string }
type Gate = (ctx: MarketContext, config: Config) => GateResult
```
Gates map 1:1 to the source checklist. See [§4](#4-gate-catalogue--codifiability).

### Layer 4 — Scoring + Risk (pure)
- **Score:** tally passing gates → band (3–4 = WAIT, 8–10 = strong), per the user's rule.
- **Vetoes:** any triggered NO-TRADE condition (Appendix A, step 13) forces a hard block
  regardless of score.
- **Stop Loss:** derived from market structure (retest low / swing low / structural
  support), never from a desired dollar loss.
- **Position size:** `lot = riskDollars / (slDistance × contractSize)`, with
  `riskDollars = accountSize × riskPct`. Contract size configurable (default 100 oz).
- **Take Profit:** TP1 = 1–1.5R, TP2 = 2R, capped by the next real S/R level (structure
  overrides the math).

### UI
Single screen: live checklist with per-gate status + detail, confidence score, active
vetoes, and a trade card (Entry / SL / TP1 / TP2 / Lot / Risk$ / R:R). Read-only —
no BUY button.

---

## 4. Gate catalogue & codifiability

Honest classification of each checklist gate. "Deterministic" = pure math; "Heuristic" =
definable but needs tunable thresholds/algorithms; "Judgment" = auto-detectable but
quality varies, may want manual override.

| Gate | Type | Notes |
|---|---|---|
| EMA9 (value, slope, price vs EMA) | Deterministic | Direct compute |
| Stochastic zones + "turning up during pullback" | Deterministic | Value + slope check |
| Breakout = **close** above level, not wick | Deterministic | close vs level; high-value filter |
| Position sizing | Deterministic | User's exact formula; needs contract size |
| R:R ≥ 1.5, TP/SL distances | Deterministic | Arithmetic once levels set |
| HH/HL / LH/LL structure | Heuristic | Swing-point algorithm (fractals/zigzag) |
| Consolidation detection | Heuristic | Flat EMA9 + overlapping candles + range-bound |
| Retest "interacted with" level/FVG/EMA | Heuristic | Proximity + touch tolerance band |
| Confirmation candle (engulfing/rejection) | Heuristic | Candlestick pattern definitions |
| "Important" S/R levels, FVG | Judgment | Auto-detect; may allow manual override |
| H1/M15 bias agreement | Deterministic/Heuristic | Multi-timeframe combine of the above |

---

## 5. Configuration

A single config object encodes *the user's* system so it can be tuned without code
changes:

```ts
type Config = {
  instrument: 'XAUUSD'
  accountSize: number        // e.g. 200
  riskPct: number            // e.g. 0.01
  contractSize: number       // e.g. 100 (oz) — verify against broker spec
  ema: { period: 9 }
  stoch: { k: number; d: number; smooth: number; overbought: number; oversold: number }
  tolerances: { retestBand: number; breakoutBufferPips: number; consolidationLookback: number }
  minRR: number              // e.g. 1.5
}
```

---

## 6. Tech stack

- **Runtime shape: local-only SPA, no backend.** Single-user tool run on the owner's own
  machine, so the Twelve Data API key lives in a gitignored `.env.local`
  (`VITE_TWELVEDATA_KEY`) and never ships to a third party. A thin serverless proxy stays
  deferred to Phase 3 (only needed if this is ever hosted publicly).
- **TypeScript (strict)** — `strict` + `noUncheckedIndexedAccess` on; the `Candle` / `Gate`
  / `Config` types are the executable spec, and candle arrays are indexed everywhere.
- **React 18 + Vite** single-page app. One screen — no router, no global state library;
  plain `useState`/`useEffect` plus a single `useMarketData()` polling hook.
- **Vitest** for tests (same Vite pipeline). Layers 2–4 are pure, so this is where the bulk
  of tests live — every indicator and gate ships with a fixture test before it's wired to UI.
- **Tailwind CSS** for the UI (status colors + checklist/trade-card table).
- **ESLint + Prettier** for lint/format.
- Engine (layers 2–4) as **pure TS modules with no I/O**, built **test-first (TDD)**.
- **Twelve Data** market-data provider (XAU/USD, M5/M15/H1, free tier). REST **poll aligned
  to the M5 close** for MVP — websockets deferred (M5 does not need sub-minute latency).
  OANDA practice remains the alternative feed.

### Codebase structure

Import direction is one-way and downward — nothing lower imports anything higher — which is
what keeps the engine pure and fully unit-testable (enforced by convention for MVP; an
ESLint boundary rule can be added later if needed):

`ui` → `hooks` → `data` / `scoring` → `gates` → `indicators` → `types`

```
northmark/
├─ src/
│  ├─ data/          # Layer 1 — ONLY place with I/O (fetch + normalize → Candle[])
│  │  └─ twelveData.ts
│  ├─ indicators/    # Layer 2 — pure: ema.ts, stochastic.ts, swingPoints.ts
│  ├─ gates/         # Layer 3 — pure: one file per gate, gates map 1:1 to checklist
│  ├─ scoring/       # Layer 4 — pure: score.ts, vetoes.ts, risk.ts (SL/lot/TP)
│  ├─ types.ts       # Candle, MarketContext, Gate, GateResult, Config
│  ├─ config.ts      # the Config object from §5 (default values)
│  ├─ hooks/         # useMarketData() — the one impure bridge to React
│  └─ ui/            # Checklist, TradeCard, VetoList, Score components
├─ tests/            # fixtures/ (known candle series); *.test.ts colocated with modules
├─ .env.local        # VITE_TWELVEDATA_KEY (gitignored)
└─ vite.config.ts
```

---

## 7. Build phasing (YAGNI)

**Phase 1 — deterministic core (start here):**
candle fetch + EMA9 + Stochastic + breakout-close gate + position sizer + R:R + trade
card + veto list. ~Half the checklist's value, correct-by-math.

**Phase 2 — heuristic gates:**
swing structure (HH/HL), consolidation detection, retest, confirmation-candle patterns,
multi-timeframe bias — each with tunable thresholds calibrated against past charts.

**Phase 3 — later, optional:**
continuous scanning + alerts; then, only once the engine is trusted, optional
auto-execution via broker API (re-introduces execution risk — explicitly deferred).

---

## 8. Risks & open questions

- **Data quality/latency:** free API tiers may lag or rate-limit; verify XAU/USD M5
  freshness before relying on signals.
- **Heuristic accuracy:** structure/consolidation/retest detection needs calibration; the
  system must fail toward WAIT when uncertain.
- **Contract size assumption:** position sizing depends on the broker's XAUUSD contract
  spec (default 100 oz) — must be verified per broker.
- **Not financial advice:** this is a decision-support tool for the owner's own use.

---

## Appendix A — Source checklist

The full XAUUSD M5 entry checklist this engine encodes (bias → structure → consolidation
check → level ID → breakout close → retest → confirmation candle → EMA9 → Stoch → SL →
lot size → R:R → signal), including the "NO-TRADE" veto conditions (step 13), the
risk-first stop loss and no-revenge-trading lot-size rules (steps 10 & 12), and the
golden rules. Kept verbatim as the authoritative source of truth for gate behavior.

> BIAS → STRUCTURE → CONSOLIDATION CHECK → RESISTANCE IDENTIFIED → BREAKOUT →
> 5M CANDLE CLOSE → RETEST → BULLISH CONFIRMATION → EMA9 CONFIRMATION →
> STOCH CONFIRMATION → CALCULATE SL → CALCULATE LOT SIZE → CHECK TP / R:R → BUY
>
> Golden rules: "I don't need to catch the beginning of the move. I need to catch the
> confirmed part of the move." / "A missed trade costs $0. A bad trade costs money."
