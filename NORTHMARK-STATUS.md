# Northmark — Build Status

> Source of truth for the `/loop` build. The orchestrator reads this at the start of every
> session/iteration, updates task states as work completes, and commits (a silent
> checkpoint). To resume a session: **"continue Northmark"** → the checkpoint skill reads
> this file and reports where things stand.

## Current

- **Phase:** 1 — Deterministic core (Phase 0 bootstrap complete)
- **Wave:** 5 — UI (Waves 0–4 done: full engine + data layer, 69 tests green)
- **Resume pointer:** Task 1.12 (designer spec + mockup, APPROVED) done. Next is **Task 1.13
  (`useMarketData` hook)**, then 1.14 (UI components + qa browser) → **Phase 1 boundary**.
  Mockup: https://claude.ai/code/artifact/379b9651-e38d-4f5e-b4a2-05fcc947a82e
- **Loop mode:** pause at phase boundary; questions answered by `product-lead` (Tier 1/2),
  Luis only on Tier 3.

## Backlog

State key: `[ ]` next/todo · `[~]` in-progress · `[x]` done · `[!]` blocked (Tier-3).

### Phase 0 — Bootstrap
- [x] Task 0.1 — Scaffold Vite + React + TS strict + Tailwind + Vitest
- [x] Task 0.2 — Create the 7 team agents
- [x] Task 0.3 — Create NORTHMARK-STATUS.md
- [x] Task 0.4 — Create the checkpoint/resume skill
- [~] Task 0.5 — Capture verbatim checklist → `docs/checklist.md` (NO-TRADE section captured;
  13-step sequence + "This is critical" continuation still pending from Luis)

### Phase 1 — Deterministic core
- [x] Task 1.0 — `types.ts` (architect)
- [x] Task 1.1 — `config.ts` (architect; Tier-2 stoch/tolerance defaults)
- [x] Task 1.2 — Test fixtures (qa)
- [x] Task 1.3 — `ema` indicator (engine + qa)
- [x] Task 1.4 — `stochastic` indicator (engine + qa)
- [x] Task 1.5 — `swingPoints` detector (engine + qa)
- [x] Task 1.6 — Breakout-close gate (engine + qa + quant-reviewer; FAITHFUL)
- [x] Task 1.7 — R:R gate (engine + qa + quant-reviewer; FAITHFUL)
- [x] Task 1.8 — `risk.ts` SL/lot/TP (engine + qa + quant-reviewer; FAITHFUL)
- [x] Task 1.9 — `vetoes.ts` (engine + qa + quant-reviewer; FAITHFUL — full 18-veto catalogue, all deferred)
- [x] Task 1.10 — `score.ts` (engine + qa + quant-reviewer; FAITHFUL)
- [x] Task 1.11 — `twelveData.ts` data layer (engine; mocked-fetch tests green; LIVE-API check deferred → needs Luis' key)
- [x] Task 1.12 — Designer spec + mockup (designer; product-lead APPROVED Tier-2; mockup published)
- [ ] Task 1.13 — `useMarketData` hook (frontend + qa)
- [ ] Task 1.14 — UI components + App wiring (frontend + qa browser)
- [ ] **Phase 1 boundary → STOP for Luis** (review decision log below)

### Phase 2 — Heuristic gates (blocked on Task 0.5)
- [ ] Task 2.1 — HH/HL / LH/LL structure
- [ ] Task 2.2 — Consolidation detection
- [ ] Task 2.3 — Retest interaction
- [ ] Task 2.4 — Confirmation candle
- [ ] Task 2.5 — Multi-timeframe bias
- [ ] Task 2.6 — Wire heuristic gates into scoring
- [ ] **Phase 2 boundary → STOP for Luis**

### Phase 3 — Later, optional (needs Luis opt-in)
- [ ] Task 3.1 — Continuous scanning + alerts (first real backend)
- [ ] Task 3.2 — Optional auto-execution via broker API (deferred — execution risk)

## Decision log (Tier-2 conservative defaults for Luis' phase-boundary review)

- **Task 1.1 · `config.stoch` = `{ k: 14, d: 3, smooth: 3, overbought: 80, oversold: 20 }`.**
  Why: canonical Wilder 14/3/3; 80/20 zones (vs looser 70/30) keep the confirmation zone
  narrow so borderline momentum does not pass — bias-toward-WAIT.
- **Task 1.1 · `config.tolerances` = `{ retestBand: 0.0005, breakoutBufferPips: 20, consolidationLookback: 20 }`.**
  Why: `retestBand` = 0.05% of price (tight touch band → only genuine level interaction
  confirms a retest); `breakoutBufferPips` = 20 pips (close must clear the level by a real
  margin, filtering wick false-breakouts); `consolidationLookback` = 20 candles (~1h40m on
  M5, requires a sustained base). All set to the stricter end of standard ranges.
- **⚠ Flag (needs Luis at phase boundary):** XAUUSD **pip→dollar convention** (e.g. $0.10 vs
  $0.01/pip) scales what `breakoutBufferPips: 20` and `contractSize: 100` mean in dollars.
  Shipped defaults are fine to build against; confirm the convention before relying on live
  sizing/buffer magnitudes.
- **Task 1.12 · UI palette** approved on the secondary-encoding guarantee (status is never
  color-alone: icon + label everywhere). CVD/ΔE validator run **deferred** to frontend/QA —
  run `dataviz/scripts/validate_palette.js` on the status hexes and snap any FAIL.
- **Task 1.8 · `takeProfits` TP1 = 1.0R** (product-lead Tier-2). Why: bank partial profit at
  the earliest defined point to de-risk fastest; TP1 need not align with the `minRR` entry
  gate (independent thresholds). TP2 = 2R and the nextSR structure-cap are per MVP §4.

## Resolved (Luis, 2026-08-14)

- **EMA20 vs EMA9 contradiction** → resolved: it's **EMA9** (typo in the veto). Annotated in
  `docs/checklist.md`; `vetoes.ts` uses `ema9-disagrees`.
- **Unavailable vetoes handling** → resolved: **defer with explicit stubs** (chosen). Done in
  `vetoes.ts` (phase-2 / phase-3 tags).

## Blocked / Tier-3 (waiting on Luis — surface at Phase 1 boundary)

- **Checklist capture (Task 0.5)** — NO-TRADE section captured. Still pending: the **13-step
  entry sequence** and the **"This is critical:"** continuation. **quant-reviewer flag:** if
  "This is critical:" contains MORE NO-TRADE conditions, the veto count (18) is not final.
- **`risk.ts` NaN-denominator** (quant-reviewer flag) — `positionSize` guards ≤0 but not
  non-finite inputs (`NaN` slips to `NaN`). Recommend hard-failing to 0 on non-finite.
- **Long-only scope** (quant-reviewer flag) — `riskReward` / `takeProfits` assume long setups.
  Confirm shorts are out of MVP scope, else R:R sign + TP cap need direction-awareness.
- **XAUUSD pip→dollar convention** — see decision log; affects `breakoutBufferPips` /
  `contractSize` real magnitudes.
- **Live-API check deferred** — `twelveData.ts` passes mocked-fetch tests, but the live
  XAU/USD M5 freshness + rate-limit check (MVP §8) needs Luis' real `VITE_TWELVEDATA_KEY`
  in `.env.local`. Provide the key to run it.
