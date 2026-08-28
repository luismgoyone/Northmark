# Per-Candle Forward-Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the paper forward-test open trades faithfully regardless of tick cadence. Today `advanceSim` opens using ONE verdict computed at tick time and applies it across every candle in the gap; because the GitHub cron actually fires every few hours (not 5 min), momentary authorized setups between ticks are never sampled, so ~no trades open. Fix: evaluate the strategy **per M5 candle** over the gap (on context sliced up to that candle), so any setup that formed between ticks is caught.

**Architecture:** `advanceSim` takes a `SignalFn` (context+candle-time → signal) instead of a precomputed `SetupSignal`. For each new candle it slices `ctx` up to that candle's time (removing higher-timeframe look-ahead) and calls the fn, guarded by try/catch (a too-short window → no open, settle still runs). `applyTick` passes engine closures: Dad via `evaluateSetup`, Claude via `evaluateSetupClaude` using the candle's time as `now` and the cached news.

**Tech Stack:** TypeScript (strict, NodeNext `.js` imports), Vitest.

## Global Constraints
- Pure `src/forwardTest.ts` / `src/serverTick.ts` (no clock/IO). NodeNext `.js` imports.
- Preserve the first-run rule: `lastProcessedTime === null` → seed the watermark to the latest candle, no backfill.
- Preserve settle semantics (per-candle high/low, SL-first). Only the OPEN sampling changes.
- Guard evaluation: if `signalFn` throws (e.g. sliced window too short for indicators), treat as `{ authorized: false }` for that candle — never let one candle abort the tick.
- Both engines evaluate on the SAME per-candle sliced context. Claude uses the candle's own time as `now` for session/news.
- Full gate before PR: `npm run typecheck && npm run test:run && npm run lint && npm run build`.
- Reference: `src/forwardTest.ts` (`advanceSim`, `verdictToSignal`, `claudeVerdictToSignal`), `src/serverTick.ts` (`applyTick`), `src/sim/engine.ts` (`simStep`, `SetupSignal`).

---

### Task 1: `advanceSim` evaluates a `SignalFn` per candle

**Files:**
- Modify: `src/forwardTest.ts`
- Test: `src/forwardTest.test.ts`

**Interfaces:**
- Produces: `type SignalFn = (ctx: MarketContext, candleTime: number) => SetupSignal`; `advanceSim(state, lastProcessedTime, ctx, config, signalFn: SignalFn)` (signature change: 5th arg is now a function, not a `SetupSignal`).

- [ ] **Step 1: Update existing call sites + add the per-candle test**

In `src/forwardTest.test.ts`, every existing `advanceSim(state, last, ctx, config, <signalExpr>)` call (7 of them) must wrap its signal in a thunk: `advanceSim(state, last, ctx, config, () => <signalExpr>)`. (A constant `SignalFn` reproduces the old behavior, so those tests keep asserting the same outcomes.)

Then add this new test proving per-candle sampling:

```ts
it('evaluates per-candle: opens only on the candle its signalFn authorizes', () => {
  const config = defaultConfig
  const simConfig = simConfigFrom(config)
  const mk = (t: number, price = 100) => ({ time: t, open: price, high: price + 0.5, low: price - 0.5, close: price })
  const ctx = { m5: [mk(1), mk(2), mk(3), mk(4)], m15: [mk(1)], h1: [mk(1)] }
  const auth = { authorized: true, direction: 'long', entry: 100, sl: 99, tp: 102, grade: 'A' } as const
  const signalFn = (_c: typeof ctx, t: number) => (t === 3 ? auth : ({ authorized: false } as const))
  // watermark at 0 → all four candles are "new"; only t=3 authorizes.
  const out = advanceSim(initialSimState(simConfig), 0, ctx, config, signalFn)
  expect(out.state.open?.openedAtTime).toBe(3)
  expect(out.state.open?.grade).toBe('A')
  expect(out.lastProcessedTime).toBe(4)
})
```
> Ensure `initialSimState`, `simConfigFrom`, `defaultConfig` are imported in this test file (they are used by existing tests). If TS complains about the `ctx` param type on `signalFn`, type it as `MarketContext` and import the type.

- [ ] **Step 2: Run to verify the new test fails**

Run: `npx vitest run src/forwardTest.test.ts`
Expected: FAIL — `advanceSim` currently treats arg 5 as a value, so calling it (`signalFn(...)`) or the thunk wrapping breaks / the per-candle open doesn't happen.

- [ ] **Step 3: Implement**

In `src/forwardTest.ts`, add the type + a slice helper, and rewrite `advanceSim`. Also update the doc comment to drop the "single current verdict" approximation note.

```ts
export type SignalFn = (ctx: MarketContext, candleTime: number) => SetupSignal

/** Context as-of `time`: m5 up to index `i`, and higher timeframes with time ≤ `time` (no look-ahead). */
function sliceContextAt(ctx: MarketContext, i: number, time: number): MarketContext {
  return {
    m5: ctx.m5.slice(0, i + 1),
    m15: ctx.m15.filter((c) => c.time <= time),
    h1: ctx.h1.filter((c) => c.time <= time),
  }
}

/**
 * Step the sim over EVERY M5 candle newer than `lastProcessedTime`, re-evaluating the strategy
 * ON EACH candle (context sliced up to that candle) via `signalFn`. This makes trade-opening
 * independent of tick cadence: setups that formed between sparse ticks are caught, because each
 * candle in the gap is replayed with its own evaluation. Settle reads each candle's high/low
 * (SL-first) and is per-candle-accurate. Pure. A first run (null watermark) seeds and never backfills.
 */
export function advanceSim(
  state: SimState,
  lastProcessedTime: number | null,
  ctx: MarketContext,
  config: Config,
  signalFn: SignalFn,
): { state: SimState; lastProcessedTime: number | null } {
  if (lastProcessedTime === null) {
    const latest = ctx.m5[ctx.m5.length - 1]
    return { state, lastProcessedTime: latest ? latest.time : null }
  }
  const simConfig = {
    startingBalance: state.startingBalance,
    riskPct: config.riskPct,
    contractSize: config.contractSize,
  }
  let s = state
  let last = lastProcessedTime
  for (let i = 0; i < ctx.m5.length; i++) {
    const candle = ctx.m5[i]!
    if (candle.time <= last) continue
    let signal: SetupSignal
    try {
      signal = signalFn(sliceContextAt(ctx, i, candle.time), candle.time)
    } catch {
      // Too-short window / evaluation error on this candle → no open; settle still runs.
      signal = { authorized: false }
    }
    s = simStep(s, signal, simConfig, candle)
    last = candle.time
  }
  return { state: s, lastProcessedTime: last }
}
```
> Keep the existing imports (`evaluateSetup` is no longer used here — remove it ONLY if nothing else in the file references it; `SetupSignal`, `simStep`, `verdictToSignal`, `claudeVerdictToSignal`, types stay). Run typecheck to confirm no unused-import lint error.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/forwardTest.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/forwardTest.ts src/forwardTest.test.ts
git commit -m "feat(sim): advanceSim evaluates per-candle (open fidelity independent of tick cadence)"
```

---

### Task 2: `applyTick` passes per-candle evaluators

**Files:**
- Modify: `src/serverTick.ts`
- Test: `src/serverTick.test.ts` (existing tests should still pass; add one asserting a mid-gap authorized setup opens).

**Interfaces:**
- `applyTick` signature unchanged; internally it now passes `SignalFn` closures to `advanceSim`.

- [ ] **Step 1: Implement the closures**

In `src/serverTick.ts`, replace the precomputed-signal lines in `applyTick`:

```ts
  const dad = advanceSim(blob.state, blob.lastProcessedTime, ctx, config, (c) =>
    verdictToSignal(evaluateSetup(c, config)),
  )
  const claude = advanceSim(blob.claudeState, blob.claudeLastProcessedTime, ctx, config, (c, t) =>
    claudeVerdictToSignal(evaluateSetupClaude(c, config, t, news)),
  )
```
(Delete the old `const dadSignal = ...` and `const claudeSignal = ...` lines. `evaluateSetup`, `evaluateSetupClaude`, `verdictToSignal`, `claudeVerdictToSignal` remain imported — now used inside the closures. `news` is already computed above from `fetched.news ?? blob.news ?? []`.)

- [ ] **Step 2: Add a coverage test**

In `src/serverTick.test.ts`, add a test that a setup which authorizes on a candle in the middle of a batch actually opens (exercising per-candle sampling through `applyTick`). Reuse the file's existing candle fixtures/`defaultConfig`. If constructing an authorizing market fixture is impractical, instead assert the invariant that `applyTick` processes every new candle by checking `claudeLastProcessedTime`/`lastProcessedTime` advance to the latest candle time after a seeded run (watermark fidelity). Keep the existing `applyTick advances BOTH accounts` and news-threading tests green.

- [ ] **Step 3: Run + full gate**

Run: `npx vitest run src/serverTick.test.ts && npm run typecheck && npx vitest run && npm run lint && npm run build`
Expected: all green, 0 lint warnings.

- [ ] **Step 4: Commit**

```bash
git add src/serverTick.ts src/serverTick.test.ts
git commit -m "feat(sim): applyTick uses per-candle evaluators for both engines"
```

---

## Self-Review
- Per-candle open sampling → Task 1. ✓
- Both engines per-candle on identical sliced context; Claude uses candle time as `now` → Task 2. ✓
- Look-ahead removed on higher timeframes (`sliceContextAt` filters m15/h1 ≤ time) → Task 1. ✓
- First-run seed / no-backfill preserved; settle unchanged → Task 1. ✓
- Robustness: try/catch → too-short windows don't abort the tick → Task 1. ✓
- Type consistency: `SignalFn` defined in Task 1, consumed by `applyTick` closures in Task 2. `advanceSim`'s 5th param is a `SignalFn` at both call sites (serverTick) and all 7 test sites (thunked).

## Notes for the executor
- Performance: up to ~200 new candles × 2 engines per tick, each an O(window) evaluation — well within the serverless budget.
- After merge this needs a **production release** (patch bump, e.g. v1.1.1) to reach the live cron; the next tick then replays the gap per-candle and can open trades. No Redis reset needed (the fix works forward from the current watermark).
