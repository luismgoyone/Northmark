# Northmark — Build Status

> Source of truth for the `/loop` build. The orchestrator reads this at the start of every
> session/iteration, updates task states as work completes, and commits (a silent
> checkpoint). To resume a session: **"continue Northmark"** → the checkpoint skill reads
> this file and reports where things stand.

## Current

- **Phase:** 1 — Deterministic core (Phase 0 bootstrap complete)
- **Wave:** 3 — scoring + risk (Wave 2 gates complete, both quant-reviewer FAITHFUL)
- **Resume pointer:** Waves 0–2 done (through R:R gate) — 30 tests green. Next is **Phase 1
  · Wave 3 · Task 1.8 (`risk.ts` — SL/lot/TP)**, then **Task 1.9 (`vetoes.ts`) → EXPECTED
  TIER-3 STOP** (needs verbatim checklist, Task 0.5), then Task 1.10 (`score.ts`).
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
- [ ] Task 1.8 — `risk.ts` SL/lot/TP (engine + qa + quant-reviewer)
- [ ] Task 1.9 — `vetoes.ts` (engine + qa + quant-reviewer; needs 0.5)
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

## Blocked / Tier-3 (waiting on Luis)

- **Task 0.5** — the verbatim XAUUSD M5 checklist (13 steps + NO-TRADE vetoes + golden
  rules) is not yet in the repo. `quant-reviewer` needs it; Phase 2 gates and `vetoes.ts`
  (Task 1.9) depend on it. Paste it and it will be saved to `docs/checklist.md`.
