# Northmark — Build Status

> Source of truth for the `/loop` build. The orchestrator reads this at the start of every
> session/iteration, updates task states as work completes, and commits (a silent
> checkpoint). To resume a session: **"continue Northmark"** → the checkpoint skill reads
> this file and reports where things stand.

## Current

- **Phase:** 1 — Deterministic core (Phase 0 bootstrap complete)
- **Wave:** 3 — scoring + risk (Wave 2 gates complete, both quant-reviewer FAITHFUL)
- **Resume pointer:** Through Task 1.8 (`risk.ts`, FAITHFUL) done — 38 tests green. Task 1.9
  (`vetoes.ts`) is BLOCKED on the checklist (Task 0.5); loop reorders around it. Next runnable
  is **Task 1.10 (`score.ts`)** (consumes gate/veto *results*, not veto *rules* — unblocked),
  then Wave 4 data (1.11), then Wave 5 UI (1.12–1.14) → **Phase 1 boundary** with only 1.9
  outstanding.
- **Loop mode:** pause at phase boundary; questions answered by `product-lead` (Tier 1/2),
  Luis only on Tier 3.

## Backlog

State key: `[ ]` next/todo · `[~]` in-progress · `[x]` done · `[!]` blocked (Tier-3).

### Phase 0 — Bootstrap
- [x] Task 0.1 — Scaffold Vite + React + TS strict + Tailwind + Vitest
- [x] Task 0.2 — Create the 7 team agents
- [x] Task 0.3 — Create NORTHMARK-STATUS.md
- [x] Task 0.4 — Create the checkpoint/resume skill
- [!] Task 0.5 — Capture verbatim Appendix A checklist → `docs/checklist.md` (Tier-3: needs Luis)

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
- [!] Task 1.9 — `vetoes.ts` (engine + qa + quant-reviewer; BLOCKED on Task 0.5 — reordered around)
- [ ] Task 1.10 — `score.ts` (engine + qa + quant-reviewer)
- [ ] Task 1.11 — `twelveData.ts` data layer (engine + qa live)
- [ ] Task 1.12 — Designer spec + mockup (designer)
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
- **Task 1.8 · `takeProfits` TP1 = 1.0R** (product-lead Tier-2). Why: bank partial profit at
  the earliest defined point to de-risk fastest; TP1 need not align with the `minRR` entry
  gate (independent thresholds). TP2 = 2R and the nextSR structure-cap are per MVP §4.

## Blocked / Tier-3 (waiting on Luis)

- **Task 0.5** — the verbatim XAUUSD M5 checklist (13 steps + NO-TRADE vetoes + golden
  rules) is not yet in the repo. `quant-reviewer` needs it; Phase 2 gates and `vetoes.ts`
  (Task 1.9) depend on it. Paste it and it will be saved to `docs/checklist.md`.
- **Task 1.9 (`vetoes.ts`)** — BLOCKED on Task 0.5 (needs the verbatim NO-TRADE conditions).
  Loop reorders around it; it's the one Phase-1 item left for Luis at the boundary.
- **`risk.ts` NaN-denominator** (quant-reviewer flag) — `positionSize` guards ≤0 but not
  non-finite inputs (`NaN` slips to `NaN`). Recommend hard-failing to 0 on non-finite;
  confirm at boundary.
- **Long-only scope** (quant-reviewer flag) — `riskReward` and `takeProfits` assume long
  setups (checklist is a bullish breakout system). Confirm shorts are out of MVP scope,
  else the R:R sign and TP cap need direction-awareness.
