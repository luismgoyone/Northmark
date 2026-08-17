# Northmark — Build Status

> Source of truth for the `/loop` build. The orchestrator reads this at the start of every
> session/iteration, updates task states as work completes, and commits (a silent
> checkpoint). To resume a session: **"continue Northmark"** → the checkpoint skill reads
> this file and reports where things stand.

## Current

- **Phase:** 2 — Heuristic gates + decision spine ✅ **COMPLETE** (stopped at boundary for Luis' review)
- **Branch:** `feat/phase2-heuristic-gates` (cut from `feat/live-price-chart`).
- **Resume pointer:** **Phase 2 boundary — awaiting Luis.** 165 tests green, typecheck clean,
  build passes. All 6 gates + 3 retrofits + the `evaluateSetup` narrative spine + UI wire-in
  are implemented and individually reviewed; final whole-branch review = "ready to merge with
  fixes" (cheap fixes landed). **Two composition decisions + Tier-3 items below need Luis
  before merge / Phase 3.**
- **Loop mode:** pause at phase boundary; questions answered by `product-lead` (Tier 1/2),
  Luis only on Tier 3.

### Phase 2 boundary — decisions for Luis (from the final whole-branch review)

1. **`market-structure` is redundant inside the sequence.** `bias` already derives direction
   from H1 structure, then the `structure` gate re-checks the *same* H1 series — so it always
   passes when bias passed (7 discriminating gates, not 8). Options: (a) evaluate `structure`
   on **M15** (the id is `h1-m15-bias` but bias ignores M15 today) for a genuinely independent
   confirmation; (b) accept + document it as an intentional overlap. **Not a correctness bug**
   (bias-toward-WAIT holds). Luis' call.
2. **`consolidation` is checked at "now", not "before the break".** The temporal refactor moved
   the break/retest/confirm back into the window, but `consolidation` still inspects the latest
   bars — so it acts as a "not currently chopping" filter, not the checklist's "consolidation
   *before* the breakout". Options: (a) evaluate it on the **pre-breakout slice**
   `c.slice(0, breakoutIdx)` for literal fidelity; (b) accept + rename/document as a current-chop
   filter. Luis' call.
3. **Re-cross invalidation rule** (a close back through the level after the retest but before
   confirmation invalidates the setup) is a design-spec inference, **not verbatim** in Appendix A.
   Confirm it matches your intent.
4. **Confirmation "upper/lower third" threshold** (2/3, 1/3) — an invented numeric bound (now
   tagged PROVISIONAL). Confirm thirds vs halves vs other before it's trusted live.

Full context for each is in the decision log + Blocked/Tier-3 below.

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
- [x] Task 1.13 — `useMarketData` hook (frontend; only impure bridge; 75 tests)
- [x] Task 1.14 — UI components + App wiring (frontend; honest WAIT state, no-BUY test; 96 tests; build green)
- [x] **Phase 1 boundary → STOPPED for Luis** (review packet below) ← YOU ARE HERE

### Phase 2 — Heuristic gates + decision spine ✅ COMPLETE (all reviewed)
- [x] Task 0.5 — Verbatim 13-step checklist captured (unblocked Phase 2)
- [x] Task 2.0T — `Direction` type + config reframe (structure-driven bounds)
- [x] Task 2.1 — HH/HL / LH/LL structure gate
- [x] Task 2.5 — H1 bias gate (emits Direction; EMA9 supports-not-overrides, tested)
- [x] Task 2.0 — Level-ID gate (reworked → the *broken* level, temporal model)
- [x] Task 2.2 — Structure-driven consolidation gate (guard fix + provisional tags)
- [x] Task R1 — breakoutClose direction-aware + price-unit buffer (dropped PIP hack)
- [x] Task 2.3 — Retest gate (holds broken level as new S/R; +short tests)
- [x] Task 2.4 — Confirmation-candle gate (+short + edges)
- [x] Task R2 — riskReward direction-aware
- [x] Task R3 — risk.ts direction-aware TP + non-finite positionSize guard
- [x] Task 2.6a — `evaluateSetup` sequence + `score.authorized` (reworked → narrative scan; hardened)
- [x] Task 2.6b — UI wire-in (App consumes evaluateSetup; 8 honest checklist rows; no BUY)
- [x] **Phase 2 boundary → STOPPED for Luis** (decisions above; final review clean) ← YOU ARE HERE

**Mid-build design fix (Luis decision):** the original all-gates-on-the-last-candle model made
a real `setup` structurally unreachable. Luis chose the **temporal narrative scan** — the
break→retest→confirm sequence is detected across the window; the broken level sits behind price
by the confirmation bar. `levelId` + `evaluateSetup` reworked accordingly; a full `setup` is now
reachable and hand-verified. See the design-spec addendum.

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
