# Northmark Phase 2 — Heuristic Gates + Decision Model (design)

> Status: approved by Luis 2026-08-17. Source of truth for the Phase 2 build. Companion to
> the MVP design (`2026-08-14-northmark-mvp-design.md`) and the verbatim checklist
> (`docs/checklist.md`, Section A — the 13-step sequence). Phase 1 (deterministic core) is
> complete; this spec adds the judgment gates and the sequence that authorizes an entry.

## Goal

Encode the verbatim 13-step strategy's *decision process* — `H1 Bias → Structure → No
Consolidation → Level → Breakout Close → Retest → Confirmation → Entry` — as pure,
testable gates, and replace the Phase-1 soft-tally with a **hard required-gate sequence**
that decides SETUP vs WAIT. Bias toward WAIT whenever a required condition is not
objectively satisfied (checklist Bot Philosophy: "a missed trade is preferable to a
low-quality trade").

## Decisions locked (2026-08-17)

1. **Both directions, now.** Long and short are first-class; every directional gate carries
   a `Direction`. `gates/riskReward.ts` and `scoring/risk.ts` are retrofitted to be
   direction-aware (they currently assume long).
2. **Structure-driven thresholds, no magic numbers.** Per the checklist's Critical
   Implementation Principle, consolidation and the breakout buffer are derived from price
   behavior and structure, not fixed candle counts / hardcoded pips. Config numbers become
   *bounds*, not the rule.
3. **Hard AND required-gate sequence authorizes entry; score is a secondary readout.** A
   valid setup requires ALL required gates to pass in the checklist's order. The band/score
   never authorizes — it only reports quality ("6/7 aligned").

## Architecture

Import direction stays one-way downward (`ui → hooks → data/scoring → gates → indicators →
types`). All Phase 2 gates are pure, no-I/O, and reason over the candle window already in
`MarketContext` (`m5`, `m15`, `h1`) — no external/session state. Retest and confirmation
look *back within the window* to find the prior breakout; they do not persist anything.

### The decision spine — `scoring/evaluateSetup.ts` (new)

```ts
type SetupVerdict =
  | { status: 'wait'; blockedBy: string; direction: Direction | null; gates: GateResult[]; vetoes: GateResult[] }
  | { status: 'setup'; direction: Direction; level: number; gates: GateResult[]; vetoes: GateResult[]; score: Score }

evaluateSetup(ctx: MarketContext, config: Config): SetupVerdict
```

Runs the required gates **in order**, short-circuiting to `wait` on the first that is not
`pass`, naming it in `blockedBy`:

`bias → structure → consolidation(clear) → level-ID → breakout-close → retest → confirmation → risk-reward`

- All required gates `pass` → `setup`, with the resolved `direction` and `level`.
- Any required gate `≠ pass` → `wait`.
- Any veto (`vetoes()` returns a `fail`) → `wait` (hard override, independent of the above).
- `score` is computed for display only; `evaluateSetup` never consults it to authorize.

### Types (`types.ts`, architect-owned)

- Add `export type Direction = 'long' | 'short'`.
- Gate signatures that are directional take `direction: Direction` (or derive it, in the
  case of bias which *emits* it). Keep the existing `Gate`/`GateResult` shapes.

### Config (`config.ts`, architect-owned)

- Reframe `tolerances.consolidationLookback` as a **max window bound**, not the trigger.
- Reframe `tolerances.breakoutBufferPips` → buffer expressed in **price units** against the
  0.01/pip XAUUSD convention (checklist Section A), scaled to recent volatility rather than
  a fixed 20-pip magnitude. Provisional values stay tagged UNVALIDATED until calibrated.
- No new arbitrary numeric thresholds without a logged Tier-2 decision.

## Gates

| Task | File | Rule (verbatim step) | Status contract |
|---|---|---|---|
| **2.0 (new)** | `gates/levelId.ts` | Step 4. From `swingPoints`, the nearest *significant* swing resistance high above price (long) / swing support low below price (short) that price must break. | Emits `{ level, status }`; `wait` if no significant level. Feeds breakout + retest. |
| 2.1 | `gates/structure.ts` | Step 2. ≥2 confirmed HH + 2 HL (long) / 2 LH + 2 LL (short), on **H1**. Confirmed swings only, not intrabar wicks. | `pass` when the pattern holds for the candidate direction, else `wait`. |
| 2.2 | `gates/consolidation.ts` | Step 3. Clear range = overlapping candle bodies + flat EMA9 slope + price mid-range vs swing structure. Structure-driven, no fixed count. | Returns `fail` (a NO-TRADE) when consolidation is present; `pass` when there is clean directional progression. |
| 2.3 | `gates/retest.ts` | Step 6. After an in-window confirmed breakout, price returns to the broken level and holds it (former resistance→support / vice-versa) within `retestBand`. | `pass` on a holding retest; `fail` on a failed retest; `wait` if no retest yet. |
| 2.4 | `gates/confirmation.ts` | Step 7. A continuation candle in the breakout direction after the retest (rejection/engulfing), not a mere touch. | `pass` on confirmation candle; `wait` until one appears. |
| 2.5 | `gates/bias.ts` | Step 1. H1 structure sets direction (HH/HL → long, LH/LL → short); EMA9 supports but never overrides. | Emits `Direction` + `pass`/`wait`; `wait` when H1 direction is unclear. |
| 2.6 | `scoring/evaluateSetup.ts` + `scoring/score.ts` | Steps 9 & 14. Wire the required-gate sequence; add `authorized: boolean` to score, driven by the sequence not the tally. | See decision spine above. |

EMA alignment (step 8) is consumed inside `bias`/`consolidation` (EMA9 supports direction,
flat EMA9 contributes to consolidation), consistent with the checklist ("EMA can support…
should not override clear structure").

## Retrofits surfaced by grounding in the Phase-1 code

- `gates/breakoutClose.ts`: make direction-aware (long = close > level+buf; short = close <
  level−buf; mirror the wick-only `fail`). Remove the hardcoded `PIP = 0.1` (contradicts the
  0.01/pip convention) in favor of the config-derived, price-unit buffer.
- `gates/riskReward.ts`: compute risk/reward by direction (long: reward = tp−entry, risk =
  entry−sl; short: mirrored).
- `scoring/risk.ts`: `takeProfits` projects TPs in the trade direction and caps by `nextSR`
  on the correct side; `positionSize` gains a **non-finite guard** (open quant-reviewer
  flag — `NaN`/`Infinity` inputs hard-fail to `0`, not propagate).
- `scoring/score.ts`: keep the band as a readout; add `authorized` fed by `evaluateSetup`.

## Testing

Same TDD + `quant-reviewer`-fidelity lifecycle per gate (failing test → verify fail →
minimal impl → verify pass → quant-reviewer against `docs/checklist.md` → architect gate →
commit). New fixtures required: a **bearish structure** series, a **breakout→retest→hold**
series, and a **breakout→failed-retest** series, each with hand-verified expected verdicts.
Every gate asserts the bias-toward-WAIT contract (never a false `pass`/`setup`).

## Known gaps (non-blocking)

- The **"This is critical:"** veto continuation (checklist Section B) is still uncaptured.
  It feeds `vetoes.ts` (Phase 1, already built), **not** these gates, so it does not block
  Phase 2. quant-reviewer flag stands: if it contains more NO-TRADE conditions, the veto
  count (18) is not final.
- Provisional `consolidationLookback` / buffer bounds remain UNVALIDATED until calibrated
  against past charts (Luis owns the calibration step before live signals are trusted).

## Addendum (2026-08-17) — Temporal narrative model (Luis decision)

Implementation of Task 2.6a surfaced a design flaw: with `levelId` returning the nearest
swing high *above* the last close, `breakoutClose` (which needs the last close *above*
level+buffer) can never pass on the same snapshot — so `status: 'setup'` was structurally
unreachable. Luis chose the **temporal narrative scan** model to fix it.

**Model:** a setup is a sequence detected *across the window over time*, not all-gates-true
on the final candle. The broken level sits *below* current price by the confirmation bar.

**`levelId` (revised) — the *broken* level:**
- long: candidates = significant swing-high prices strictly **below** the last close; `level = max(candidates)` (the highest resistance price has already cleared). `wait` + null if none.
- short: candidates = significant swing-low prices strictly **above** the last close; `level = min(candidates)`. `wait` + null if none.

**`evaluateSetup` (revised) — narrative scan (long; short mirrors):** with `level` from the
revised `levelId`, `buffer = breakoutBufferPips × 0.01`, `band = level × retestBand`:
1. `breakoutIdx` = first `i` with `c[i].close > level + buffer` (clean close breakout). None → WAIT@`breakout-close`.
2. `retestIdx` = first `j > breakoutIdx` with `c[j].low ≤ level + band` (returned): `c[j].close ≥ level` → hold (record `j`); `< level` → WAIT@`retest` (failed retest, first-touch decides). No touch → WAIT@`retest`.
3. `confirmIdx` = first `k > retestIdx` where `confirmation(c.slice(0,k+1), dir)` passes. None → WAIT@`confirmation`.
4. Setup: `entry = c[last].close`, `sl = level` (structural — a close back through the level invalidates), `slDistance = entry − level`; `takeProfits`/`riskReward`/`positionSize` as before. Any veto → WAIT.

The 8 gate-result rows are built by invoking the **unchanged** reviewed gates on window
slices (`breakoutClose(c.slice(0,breakoutIdx+1), …)`, `retest(c.slice(0,retestIdx+1), …)`,
`confirmation(c.slice(0,confirmIdx+1), …)`) so their semantics and prior reviews carry over.
`structure`, `bias`, `consolidation`, `breakoutClose`, `retest`, `confirmation`,
`riskReward`, `risk` are **unchanged** by this addendum.

## Self-review

- **Placeholders:** none unassigned. Provisional config bounds are explicitly tagged and
  owned (calibration = Luis).
- **Consistency:** decision spine (hard AND) is applied uniformly; score is demoted
  everywhere it appears. Direction threads from `bias` (emit) through every directional gate
  and both retrofit files.
- **Scope:** one implementation plan — six gates (2.0–2.5) + one wire-in (2.6) + four
  bounded retrofits. No unrelated refactoring.
- **Ambiguity:** "significant" swing level (2.0) is the one soft term; resolved as the
  nearest swing high/low that is itself a confirmed swing point (from `swingPoints`) beyond
  current price — not every fractal. Made explicit in the 2.0 contract.
