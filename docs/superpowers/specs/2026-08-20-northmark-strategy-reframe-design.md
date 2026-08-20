# Northmark Strategy Reframe — Required / Supporting Audit + 3-Layer Model

**Date:** 2026-08-20
**Status:** Design — approved for planning
**Source feedback:** `Northmark_XAUUSD_Strategy_Review (2).md` (external review)

## Motivation

An external strategy review recommended Northmark stop treating *every* observation
as a mandatory pass/fail gate. Its headline: **"simplify the logic before adding more
criteria"** and keep only *a small number of hard filters*, letting supporting
observations raise or lower conviction instead of hard-blocking otherwise-valid setups.

The review also proposes several *additions* (a Breakout Expansion setup, a Jason
9:30–9:45 EST time-window strategy, FVG/FCR detectors, volume analysis, M1 data). Those
are **explicitly out of scope here** — see Non-Goals. This spec covers only what the
review's own "Recommended Next Step" asked for: **audit the current checks against the
strategy, classify Required vs Supporting, remove redundancy, and produce a simplified
decision flow.** No new data sources, no new setup pathways.

## Current state

`src/scoring/evaluateSetup.ts` runs a strict linear AND-sequence of 8 gates and
short-circuits to WAIT on the first non-`pass`:

```
h1-m15-bias → market-structure → consolidation → level-id
            → breakout-close → retest → confirmation → risk-reward
```

`score.authorized` is the real signal; `score.band` (`wait`/`building`/`strong`) is a
display-only tally of passing gates and does not influence authorization. This sequence
already *is* the review's "Path A — Trend/Structure Setup."

## Audit: Required / Supporting / redundant

| Gate | Blocks today | Review classification | Verdict |
|---|---|---|---|
| `h1-m15-bias` (H1 structure → direction) | yes | HTF direction = Required | **Required** |
| ↳ EMA9 slope (inside `bias`) | yes (vetoes on *strong* oppose) | EMA alignment = **Supporting** | **Relax → Supporting** |
| `market-structure` (M15 re-confirm) | yes | *not a separate Required* | **Relax → Supporting** (redundant with H1 bias) |
| `consolidation` (M5 chop filter) | yes | "RANGE → NO TRADE" = hard | **Required** |
| `level-id` (meaningful S/R) | yes | Important S/R = Required | **Required** |
| `breakout-close` | yes | Breakout/displacement = Required | **Required** |
| `retest` | yes | Retest = Required (Path A) | **Required** |
| `confirmation` (M5 candle shape) | yes | M1/M5 confirmation = Required | **Required** |
| `risk-reward` (SL + min R:R) | yes | SL + R:R = Required | **Required** |
| stochastic | no (chart-only) | Stochastic = Supporting | unchanged (stays non-blocking; not folded into band this pass) |

**Redundancy removed:** `bias` derives direction from H1 structure and `market-structure`
re-derives the same direction on M15. That overlap is the clearest instance of the
"turned an observation into a mandatory condition" pattern the review flags. M15 structure
becomes a supporting conviction signal, not a second hard gate.

## Reframed architecture

### Required hard filters (block → WAIT/NO-TRADE)

Unchanged ordering, temporal narrative scan, and short-circuit behavior — just two fewer
gates in the hard set:

```
bias-direction (H1 structure only) → consolidation → level-id
    → breakout → retest → confirmation → risk-reward
```

All pass ⇒ **authorized**. The determination is computed exactly as today.

### Supporting confirmations (evaluated every tick, NEVER block)

- **M15 structure** — extracted from the hard sequence into its own `GateResult`,
  still computed via the existing `structure()` gate on `ctx.m15`, but its status no
  longer short-circuits.
- **EMA9 alignment** — extracted out of `bias`. `bias` keeps pure H1-structure direction;
  EMA9 slope agreement becomes a standalone supporting `GateResult`. The former
  "strong-oppose" veto path is removed — EMA9 can never block a setup, only lower
  conviction.

Supporting checks are collected into a dedicated array on the verdict (separate from the
hard `gates` array) so the UI can render them beside the band.

### Confidence band (now meaningful)

`score()` gains a supporting-agreement input and defines the band as:

- `strong` — authorized **and** all supporting confirmations pass
- `building` — authorized **and** partial / no supporting agreement
- `wait` — not authorized, **or** any veto fires

`authorized` remains caller-asserted and demoted to `false` on any veto (unchanged).
No 4th band, no new thresholds, no new data.

### Deliberate non-behaviors

- **No "enough supporting" gate.** Supporting confirmations only move conviction; hard
  filters alone authorize. Requiring N-of-M supporting checks would re-introduce the
  mandatory-condition trap the review warns against.
- **Vetoes derive only from the hard-filter sequence.** A supporting check can never emit
  a NO-TRADE veto.

## UI changes

- **Checklist grouped into the review's 3 layers:** Market Filter (bias/direction,
  consolidation, level-id) · Setup (breakout, retest) · Trigger (confirmation, risk-reward).
  Pure presentational grouping over the existing hard-filter results — no engine impact.
- **Supporting confirmations shown beside the confidence band** (M15 structure, EMA9
  alignment) as conviction signals, visually distinct from the pass/fail hard filters so
  it's clear they never block.
- `Score`/band copy updated so `strong` reads as "authorized + full confirmation" rather
  than a raw tally.

## Non-Goals (explicitly deferred)

- Breakout Expansion setup (Path B), volume analysis — spot-gold volume is unreliable.
- Jason 9:30–9:45 EST time-window strategy, session clock, M1 candles. **Architecture
  decided (its own future spec):** per `Northmark_Jason_First_M5_Check.md`, Jason is *not*
  a separate strategy path or a multi-path dispatcher — it is a **time-gated first check at
  the M5 stage** inside the one continuous H1→M15→M5 flow. When time ∈ 9:30–9:45 EST, run
  the Jason check first; on PASS execute the Jason setup (after risk validation), on FAIL
  **fall straight through to the normal Northmark M5 checks**. Jason failure must *never*
  veto Northmark. The detector (area/range/confirmation), the session clock, and the volume
  question are still unspecified and require their own brainstorm before implementation.
- FVG / FCR detectors.
- Multi-pathway OR dispatch across setups. This pass keeps the single Path-A chain.
- Gating authorization on supporting-confirmation count.

## Forward pointers

- When Path B (Breakout Expansion) is built, **retest becomes pathway-specific**
  (optional for a strong breakout entry, required for a retest entry) rather than a global
  hard filter.
- Stochastic may later fold into the supporting-confirmation set once its role is
  calibrated.
- **Jason Priority Check** (next spec): a time-gated first check at the M5 stage
  (9:30–9:45 EST), never-veto, falling through to the normal M5 checks on failure. Needs a
  session clock and a deterministic detector before it can be built.

## Testing impact

- `bias` tests: split into H1-structure-direction (blocking) and EMA9-alignment (supporting,
  non-blocking); remove assertions that EMA9 strong-oppose forces WAIT.
- `evaluateSetup` tests: setups that previously blocked on divergent M15 structure or
  opposing EMA9 now authorize with a lowered band; add cases asserting `authorized === true`
  with `band === 'building'` under those conditions, and `band === 'strong'` when both
  supporting pass.
- `score` tests: cover the new band definition (authorized + full/partial supporting).
- UI tests: checklist renders 3 layer groups; supporting confirmations render beside the
  band and are never styled as blockers.
```
