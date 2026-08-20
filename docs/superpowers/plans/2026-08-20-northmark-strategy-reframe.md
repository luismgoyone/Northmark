# Northmark Strategy Reframe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclassify the 8-gate AND-sequence into hard filters vs supporting confirmations — relax M15 structure and EMA9 to non-blocking signals that drive a now-meaningful confidence band, and group the checklist into Market/Setup/Trigger layers.

**Architecture:** The engine keeps its ordered required-gate sequence and temporal narrative scan, but drops from 8 to **7 hard filters** (block → WAIT). Two checks — **M15 structure** and **EMA9 alignment** — move to a parallel `supporting: GateResult[]` set that never blocks; instead `score()` derives the band from them (`strong` = authorized + all supporting pass; `building` = authorized + partial; `wait` = not authorized). UI groups the 7 hard filters into the review's three layers and renders supporting checks beside the band.

**Tech Stack:** React 18 + Vite + TypeScript (strict, `noUncheckedIndexedAccess`) + Tailwind + Vitest.

## Global Constraints

- Pure deterministic engine; one-way downward imports (`ui → hooks → scoring → gates → indicators → types`). No AI/LLM in the decision path.
- No new data sources this pass: **no volume, no M1 candles, no session clock, no Jason detector, no FVG/FCR, no new setup pathways** (all deferred per the spec's Non-Goals).
- `authorized` is the trade signal; the band is conviction only. Supporting checks **never** block and **never** emit a NO-TRADE veto.
- Do not gate authorization on a count of supporting confirmations.
- Every `<svg fill="none">` must also set a stroke color (ESLint `no-restricted-syntax` guard) — not relevant to new code here but keep it green.
- Commands: `npm run typecheck`, `npx eslint .`, `npm test`, `npm run build`.
- Spec: `docs/superpowers/specs/2026-08-20-northmark-strategy-reframe-design.md`.

---

## File Structure

**Engine (`src/gates`, `src/scoring`):**
- Create `src/gates/emaAlignment.ts` — supporting EMA9-alignment check (extracted from `bias`).
- Modify `src/gates/bias.ts` — pure H1-structure direction; drop EMA9 veto.
- Modify `src/scoring/vetoes.ts` — simplify `firedDetail` for `h1-bias-unclear` (bias no longer conflates EMA9).
- Modify `src/scoring/score.ts` — band from authorization + supporting agreement.
- Modify `src/scoring/evaluateSetup.ts` — 7-gate hard `ORDER`; build `supporting`; add `supporting` to `SetupVerdict`.

**UI (`src/ui`, `src/App.tsx`):**
- Modify `src/ui/labels.ts` — 7 hard gates, `SUPPORTING_GATES`, `CHECKLIST_LAYERS`.
- Modify `src/ui/Checklist.tsx` — render the 3 layer groups.
- Modify `src/ui/Score.tsx` — `supporting` prop + chips; `total` default 7.
- Modify `src/App.tsx` — pass `result.supporting` to `Score`.

Each task ends green (typecheck + lint + full test suite) so a reviewer can gate it independently.

---

## Task 1: EMA9 alignment supporting gate

**Files:**
- Create: `src/gates/emaAlignment.ts`
- Test: `src/gates/emaAlignment.test.ts`

**Interfaces:**
- Consumes: `ema(candles, period): { value, slope: 'rising'|'flat'|'falling' }` from `src/indicators/ema.ts`; `MarketContext`, `Direction`, `GateResult`, `Config` from `src/types.ts`.
- Produces: `emaAlignment(ctx: MarketContext, direction: Direction, config: Config): GateResult` with `id: 'ema9-alignment'` — `pass` when H1 EMA9 slope supports the direction or is flat, `wait` when it opposes. Never `fail`, never blocks.

- [ ] **Step 1: Write the failing test**

```ts
// src/gates/emaAlignment.test.ts
import { describe, expect, it } from 'vitest'
import { emaAlignment } from './emaAlignment'
import { defaultConfig } from '../config'
import { longTrendWithTail, trendSeries } from '../../tests/fixtures/structureSeries'
import type { MarketContext } from '../types'

const ctxWith = (h1: MarketContext['h1']): MarketContext => ({ m5: h1, m15: h1, h1 })

describe('emaAlignment (supporting, never blocks)', () => {
  it('passes when a rising EMA9 supports a long direction', () => {
    const r = emaAlignment(ctxWith(trendSeries('up')), 'long', defaultConfig)
    expect(r.id).toBe('ema9-alignment')
    expect(r.status).toBe('pass')
  })

  it('passes when a falling EMA9 supports a short direction', () => {
    expect(emaAlignment(ctxWith(trendSeries('down')), 'short', defaultConfig).status).toBe('pass')
  })

  it('passes (neutral) when EMA9 is flat under a long direction', () => {
    // longTrendWithTail(1050, 3) plateaus → flat EMA9 slope (see bias fixtures).
    expect(emaAlignment(ctxWith(longTrendWithTail(1050, 3)), 'long', defaultConfig).status).toBe('pass')
  })

  it('withholds (wait, not fail) when a falling EMA9 opposes a long direction', () => {
    // longTrendWithTail(1044, 4) drops the tail below the settled EMA9 → falling slope.
    const r = emaAlignment(ctxWith(longTrendWithTail(1044, 4)), 'long', defaultConfig)
    expect(r.status).toBe('wait')
    expect(r.status).not.toBe('fail')
  })

  it('withholds when a rising EMA9 opposes a short direction', () => {
    expect(emaAlignment(ctxWith(trendSeries('up')), 'short', defaultConfig).status).toBe('wait')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/gates/emaAlignment.test.ts`
Expected: FAIL — `Cannot find module './emaAlignment'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/gates/emaAlignment.ts
import type { Config, Direction, GateResult, MarketContext } from '../types'
import { ema } from '../indicators/ema'

/**
 * Supporting confirmation (NEVER blocks): H1 EMA9 slope agrees with the candidate
 * direction. Long is supported by a rising or flat EMA9; short by a falling or flat one.
 * An opposing slope only WITHHOLDS this confirmation (status 'wait'), lowering the
 * confidence band — it never fails or blocks. Extracted out of `bias` per the
 * 2026-08-20 reframe so EMA9 can never veto an otherwise-valid setup.
 */
export function emaAlignment(ctx: MarketContext, direction: Direction, config: Config): GateResult {
  const id = 'ema9-alignment'
  const { slope } = ema(ctx.h1, config.ema.period)
  const opposes = (direction === 'long' && slope === 'falling') || (direction === 'short' && slope === 'rising')
  if (opposes) {
    return { id, status: 'wait', detail: `EMA9 slope ${slope} opposes ${direction} — confirmation withheld (does not block).` }
  }
  return { id, status: 'pass', detail: `EMA9 slope ${slope} supports ${direction} (or is neutral).` }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/gates/emaAlignment.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/gates/emaAlignment.ts src/gates/emaAlignment.test.ts
git commit -m "feat: add EMA9 alignment supporting gate (extracted from bias)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Simplify `bias` to pure H1 structure

Bias stops consulting EMA9 (that moved to Task 1). It now blocks only when H1 structure is unclear. This changes `bias`'s signature (drops `config`) and its behavior (an opposing EMA9 no longer forces WAIT), so the one call site and the affected tests update together.

**Files:**
- Modify: `src/gates/bias.ts`
- Modify: `src/scoring/evaluateSetup.ts` (the single `bias(...)` call site)
- Modify: `src/scoring/vetoes.ts` (`firedDetail` for `h1-bias-unclear`)
- Test: `src/gates/bias.test.ts`, `src/scoring/vetoes.test.ts`

**Interfaces:**
- Produces: `bias(ctx: MarketContext): { result: GateResult; direction: Direction | null }` — `pass`+direction when H1 structure is clean; `wait`+null when unclear. `id` stays `'h1-m15-bias'`.

- [ ] **Step 1: Rewrite `bias.ts` (no EMA, no config)**

```ts
// src/gates/bias.ts
import type { Direction, GateResult, MarketContext } from '../types'
import { structureDirection } from './structure'

/**
 * Primary bias: direction from H1 market structure ONLY (2026-08-20 reframe).
 * EMA9 alignment moved to its own supporting gate (`emaAlignment`) so it can never
 * veto a setup. This gate blocks only when H1 structure is unclear.
 */
export function bias(ctx: MarketContext): { result: GateResult; direction: Direction | null } {
  const id = 'h1-m15-bias'
  const direction = structureDirection(ctx.h1)
  if (direction === null) {
    return { result: { id, status: 'wait', detail: 'H1 direction is unclear (no clean HH/HL or LH/LL). No trade.' }, direction: null }
  }
  return { result: { id, status: 'pass', detail: `H1 bias ${direction} from clean structure.` }, direction }
}
```

- [ ] **Step 2: Update the call site in `evaluateSetup.ts`**

Change line ~47 from `const b = bias(ctx, config)` to:

```ts
  const b = bias(ctx)
```

- [ ] **Step 3: Simplify `firedDetail` in `vetoes.ts`**

Bias no longer fails for two reasons, so the fired `h1-bias-unclear` detail can name the sole cause. Replace the `firedDetail` function body (lines ~97-102):

```ts
function firedDetail(spec: VetoSpec): string {
  if (spec.id === 'h1-bias-unclear') return 'H1 direction is unclear — no clean HH/HL or LH/LL.'
  return `${spec.label} is the active no-trade condition.`
}
```

- [ ] **Step 4: Replace `bias.test.ts`**

```ts
// src/gates/bias.test.ts
import { describe, expect, it } from 'vitest'
import { bias } from './bias'
import { longTrendWithTail, rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'
import type { MarketContext } from '../types'

const ctxWith = (h1: MarketContext['h1']): MarketContext => ({ m5: h1, m15: h1, h1 })

describe('bias (pure H1 structure)', () => {
  it('emits long when H1 structure rises', () => {
    const { result, direction } = bias(ctxWith(trendSeries('up')))
    expect(result.id).toBe('h1-m15-bias')
    expect(result.status).toBe('pass')
    expect(direction).toBe('long')
  })

  it('emits short for a falling H1', () => {
    expect(bias(ctxWith(trendSeries('down'))).direction).toBe('short')
  })

  it('waits with null direction when H1 is an unclear range', () => {
    const { result, direction } = bias(ctxWith(rangeSeries()))
    expect(result.status).toBe('wait')
    expect(direction).toBeNull()
  })

  it('NO LONGER blocks on an opposing EMA9 — falling EMA9 with clean long structure still passes', () => {
    // This fixture previously forced WAIT via the old EMA9 veto; EMA9 now lives in emaAlignment.
    const { result, direction } = bias(ctxWith(longTrendWithTail(1044, 4)))
    expect(result.status).toBe('pass')
    expect(direction).toBe('long')
  })
})
```

- [ ] **Step 5: Update the `firedDetail` test in `vetoes.test.ts`**

Replace the test at lines ~154-161 ("fired h1-bias-unclear detail stays accurate for BOTH…") with:

```ts
  it('fired h1-bias-unclear detail names the (now sole) unclear-structure cause', () => {
    const results = vetoes(gatesWith({ 'h1-m15-bias': 'fail' }), config)
    const fired = results.find((r) => r.id === 'h1-bias-unclear')!
    expect(fired.status).toBe('fail')
    expect(fired.detail).toBe('H1 direction is unclear — no clean HH/HL or LH/LL.')
  })
```

- [ ] **Step 6: Run the affected tests**

Run: `npm test -- src/gates/bias.test.ts src/scoring/vetoes.test.ts src/scoring/evaluateSetup.test.ts`
Expected: `bias` + `vetoes` PASS. `evaluateSetup.test.ts` still references `bias({...}, cfg)` (2-arg) and an 8-gate order — those are fixed in Task 3, so it may report TS/assertion errors here. If the runner blocks on the `bias` arity in evaluateSetup.test, proceed to Step 7 (the call-site in `evaluateSetup.ts` itself is already fixed in Step 2; the test-file arg fixes land in Task 3). Confirm at minimum `bias.test.ts` and `vetoes.test.ts` are green.

- [ ] **Step 7: Typecheck the source (not test) + commit**

```bash
npm run typecheck
```
Expected: PASS — `src/**` compiles (the source call site is 1-arg; `*.test.ts` are included in typecheck, so if `evaluateSetup.test.ts` still calls `bias(ctx, cfg)` this will FAIL). To keep this task self-contained and green, also apply the three `bias(...)` arg fixes in `evaluateSetup.test.ts` now (they belong to Task 3 but are trivial): change `bias({ m5, m15, h1 }, cfg)` / `bias(ctx, defaultConfig)` to drop the second argument at lines ~136, ~156, ~205. Re-run:

```bash
npm run typecheck && npm test -- src/gates/bias.test.ts src/scoring/vetoes.test.ts
git add src/gates/bias.ts src/gates/bias.test.ts src/scoring/vetoes.ts src/scoring/vetoes.test.ts src/scoring/evaluateSetup.ts src/scoring/evaluateSetup.test.ts
git commit -m "refactor: bias uses pure H1 structure; EMA9 no longer vetoes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Supporting reframe in the engine

Remove `market-structure` from the hard `ORDER` (7 gates now), evaluate M15 structure + EMA9 alignment as `supporting`, and make `score()` derive the band from authorization + supporting agreement.

**Files:**
- Modify: `src/scoring/score.ts`
- Modify: `src/scoring/evaluateSetup.ts`
- Test: `src/scoring/score.test.ts`, `src/scoring/evaluateSetup.test.ts`, `src/scoring/vetoes.test.ts`

**Interfaces:**
- Produces: `score(gateResults, vetoes?, authorized?, supporting?): { passed, band, authorized }` — band is `wait` unless authorized; `strong` when authorized and every supporting result is `pass`; else `building`.
- Produces: `SetupVerdict` gains `supporting: GateResult[]` on both variants. Hard `ORDER = ['h1-m15-bias','consolidation','level-id','breakout-close','retest','confirmation','risk-reward']`.
- Consumes: `emaAlignment` (Task 1), `structure` (existing), `bias` (Task 2).

- [ ] **Step 1: Rewrite `score.ts`**

```ts
// src/scoring/score.ts
import type { GateResult } from '../types'

// Pure module, no I/O. Import direction is downward only (types).
//
// The band is DISPLAY conviction, derived from authorization + supporting agreement
// (2026-08-20 reframe). It is NOT a raw pass tally, and it is never 'strong'/'building'
// unless the setup is authorized. `passed` still reports the hard-gate tally for the meter.

export type ScoreBand = 'wait' | 'building' | 'strong'

export type Score = { passed: number; band: ScoreBand; authorized: boolean }

/**
 * Score a setup into a confidence band.
 *
 * `passed` counts hard gates with status 'pass' (for the meter/count only).
 *
 * `authorized` is caller-asserted, demoted to false whenever any veto fires
 * (status 'fail'). score() never claims authorization on its own.
 *
 * Band:
 *   - not authorized (or a veto fired) → 'wait'
 *   - authorized AND every supporting result passes → 'strong'
 *   - authorized AND some/no supporting agreement    → 'building'
 * Supporting checks NEVER block — they only raise/lower conviction here.
 */
export function score(
  gateResults: GateResult[],
  vetoes: GateResult[] = [],
  authorized = false,
  supporting: GateResult[] = [],
): Score {
  const passed = gateResults.filter((g) => g.status === 'pass').length
  const vetoed = vetoes.some((v) => v.status === 'fail')
  const auth = authorized && !vetoed

  let band: ScoreBand
  if (!auth) {
    band = 'wait'
  } else if (supporting.length > 0 && supporting.every((s) => s.status === 'pass')) {
    band = 'strong'
  } else {
    band = 'building'
  }

  return { passed, band, authorized: auth }
}
```

- [ ] **Step 2: Replace `score.test.ts`**

```ts
// src/scoring/score.test.ts
import { describe, expect, it } from 'vitest'
import type { GateResult } from '../types'
import { score } from './score'

const passes = (n: number): GateResult[] =>
  Array.from({ length: n }, (_, i) => ({ id: `pass-${i}`, status: 'pass', detail: '' }))
const sup = (statuses: GateResult['status'][]): GateResult[] =>
  statuses.map((s, i) => ({ id: `sup-${i}`, status: s, detail: '' }))

describe('score (band from authorization + supporting)', () => {
  it('band is wait whenever not authorized, regardless of gate tally', () => {
    expect(score(passes(7)).band).toBe('wait')
    expect(score(passes(7), [], false, sup(['pass', 'pass'])).band).toBe('wait')
  })

  it('authorized + all supporting pass → strong', () => {
    expect(score(passes(7), [], true, sup(['pass', 'pass']))).toEqual({
      passed: 7, band: 'strong', authorized: true,
    })
  })

  it('authorized + a supporting confirmation withheld → building', () => {
    expect(score(passes(7), [], true, sup(['pass', 'wait'])).band).toBe('building')
  })

  it('authorized with NO supporting checks → building (never strong without confirmation)', () => {
    expect(score(passes(7), [], true, []).band).toBe('building')
  })

  it('a firing veto forces wait and demotes authorized', () => {
    const veto: GateResult = { id: 'x', status: 'fail', detail: '' }
    expect(score(passes(7), [veto], true, sup(['pass', 'pass']))).toEqual({
      passed: 7, band: 'wait', authorized: false,
    })
  })

  it('non-firing vetoes (wait/pass) do not override an authorized strong band', () => {
    expect(score(passes(7), [{ id: 'a', status: 'wait', detail: '' }], true, sup(['pass', 'pass'])).band).toBe('strong')
    expect(score(passes(7), [{ id: 'a', status: 'pass', detail: '' }], true, sup(['pass', 'pass'])).band).toBe('strong')
  })

  it('passed counts only pass-status gates', () => {
    const mixed: GateResult[] = [
      { id: 'a', status: 'pass', detail: '' },
      { id: 'b', status: 'fail', detail: '' },
      { id: 'c', status: 'wait', detail: '' },
      { id: 'd', status: 'pass', detail: '' },
    ]
    expect(score(mixed).passed).toBe(2)
  })

  it('defaults: authorized false, band wait, passed 0 for empty input', () => {
    expect(score([])).toEqual({ passed: 0, band: 'wait', authorized: false })
  })
})
```

- [ ] **Step 3: Rewrite `evaluateSetup.ts`**

Full replacement (7-gate `ORDER`, `supporting` threaded through `finish` and the setup return; `market-structure` removed from the hard sequence and evaluated as supporting):

```ts
// src/scoring/evaluateSetup.ts
import type { Candle, Config, Direction, GateResult, MarketContext } from '../types'
import { bias } from '../gates/bias'
import { structure } from '../gates/structure'
import { emaAlignment } from '../gates/emaAlignment'
import { consolidation } from '../gates/consolidation'
import { levelId } from '../gates/levelId'
import { breakoutClose } from '../gates/breakoutClose'
import { confirmation } from '../gates/confirmation'
import { riskReward } from '../gates/riskReward'
import { swingPoints } from '../indicators/swingPoints'
import { positionSize, takeProfits } from './risk'
import { vetoes } from './vetoes'
import { score, type Score } from './score'

export type SetupVerdict =
  | { status: 'wait'; blockedBy: string; direction: Direction | null; gates: GateResult[]; supporting: GateResult[]; vetoes: GateResult[]; score: Score }
  | { status: 'setup'; direction: Direction; level: number; entry: number; sl: number; tp1: number; tp2: number; lot: number; gates: GateResult[]; supporting: GateResult[]; vetoes: GateResult[]; score: Score }

const WAIT = (id: string): GateResult => ({ id, status: 'wait', detail: 'Not evaluated — an earlier required gate did not pass.' })

// Hard required filters, in checklist order. M15 structure + EMA9 are SUPPORTING (below),
// not in this sequence (2026-08-20 reframe).
const ORDER = ['h1-m15-bias', 'consolidation', 'level-id', 'breakout-close', 'retest', 'confirmation', 'risk-reward'] as const

/** Nearest significant OPPOSING level beyond `entry`, for the structural TP cap (checklist step 11). */
function opposingLevel(candles: Candle[], direction: Direction, entry: number): number | undefined {
  const { highs, lows } = swingPoints(candles)
  if (direction === 'long') {
    const above = highs.map((i) => candles[i]!.high).filter((h) => h > entry)
    return above.length ? Math.min(...above) : undefined
  }
  const below = lows.map((i) => candles[i]!.low).filter((l) => l < entry)
  return below.length ? Math.max(...below) : undefined
}

/**
 * Required-gate sequence (hard filters) + supporting confirmations.
 * Runs the 7 hard gates in order and short-circuits to WAIT on the first non-'pass',
 * naming it in `blockedBy`. M15 structure + EMA9 alignment are evaluated as SUPPORTING
 * once the direction is known — they never block; they only move the confidence band.
 * `authorized` is driven by the hard sequence; any firing veto forces WAIT.
 */
export function evaluateSetup(ctx: MarketContext, config: Config): SetupVerdict {
  const results = new Map<string, GateResult>()
  let supporting: GateResult[] = []
  const finish = (blockedBy: string, direction: Direction | null): SetupVerdict => {
    const gates = ORDER.map((id) => results.get(id) ?? WAIT(id))
    const vetoResults = vetoes(gates, config)
    return { status: 'wait', blockedBy, direction, gates, supporting, vetoes: vetoResults, score: score(gates, vetoResults, false, supporting) }
  }

  // 1. Bias → direction (hard filter)
  const b = bias(ctx)
  results.set('h1-m15-bias', b.result)
  if (b.result.status !== 'pass' || b.direction === null) return finish('h1-m15-bias', b.direction)
  const direction = b.direction

  // Supporting confirmations — evaluated now that direction is known; NEVER block.
  // M15 structure (independent of the H1 bias that set direction) + H1 EMA9 alignment.
  supporting = [structure(ctx.m15, direction), emaAlignment(ctx, direction, config)]

  // 2. Consolidation (hard; CURRENT-CHOP filter — checklist step 3). fail = NO-TRADE.
  const con = consolidation(ctx.m5, config)
  results.set('consolidation', con)
  if (con.status !== 'pass') return finish('consolidation', direction)

  // 3. Level-ID (hard)
  const lvl = levelId(ctx.m5, direction)
  results.set('level-id', lvl.result)
  if (lvl.result.status !== 'pass' || lvl.level === null) return finish('level-id', direction)
  const level = lvl.level

  // Temporal narrative scan on M5 (checklist steps 5→9). The broken `level` sits on the far
  // side of price now; detect the completed break → retest → confirm story across the window.
  const c = ctx.m5
  const buffer = config.tolerances.breakoutBufferPips * 0.01
  const band = level * config.tolerances.retestBand
  const isLong = direction === 'long'

  // Bound the breakout scan to AFTER the level's pivot formed — a level cannot break before it exists.
  const { highs, lows } = swingPoints(c)
  let levelPivotIdx = -1
  const pivotIdxs = isLong ? highs : lows
  for (let p = pivotIdxs.length - 1; p >= 0; p--) {
    const idx = pivotIdxs[p]!
    if ((isLong ? c[idx]!.high : c[idx]!.low) === level) {
      levelPivotIdx = idx
      break
    }
  }
  const scanStart = levelPivotIdx >= 0 ? levelPivotIdx + 1 : 0

  // 4. Breakout: first bar AFTER the level's pivot that CLOSED beyond level ± buffer.
  let breakoutIdx = -1
  for (let i = scanStart; i < c.length; i++) {
    const close = c[i]!.close
    if (isLong ? close > level + buffer : close < level - buffer) {
      breakoutIdx = i
      break
    }
  }
  if (breakoutIdx === -1) {
    results.set('breakout-close', {
      id: 'breakout-close',
      status: 'wait',
      detail: `No candle has closed ${isLong ? 'above' : 'below'} level ${level} ${isLong ? '+' : '−'} buffer ${buffer} in the window.`,
    })
    return finish('breakout-close', direction)
  }
  results.set('breakout-close', breakoutClose(c.slice(0, breakoutIdx + 1), level, direction, config))

  // 5. Retest: first bar after the breakout that returned to the level; hold vs. fail by close.
  let retestIdx = -1
  for (let j = breakoutIdx + 1; j < c.length; j++) {
    const bar = c[j]!
    const touched = isLong ? bar.low <= level + band : bar.high >= level - band
    if (!touched) continue
    const held = isLong ? bar.close >= level : bar.close <= level
    if (held) {
      retestIdx = j
      results.set('retest', {
        id: 'retest',
        status: 'pass',
        detail: `Retest at bar ${j}: ${isLong ? `low ${bar.low}` : `high ${bar.high}`} touched band, close ${bar.close} held ${isLong ? '≥' : '≤'} level ${level}.`,
      })
      break
    }
    results.set('retest', {
      id: 'retest',
      status: 'fail',
      detail: `Failed retest at bar ${j}: close ${bar.close} fell back ${isLong ? 'below' : 'above'} level ${level}.`,
    })
    return finish('retest', direction)
  }
  if (retestIdx === -1) {
    results.set('retest', {
      id: 'retest',
      status: 'wait',
      detail: 'Breakout occurred but price has not returned to hold the level yet.',
    })
    return finish('retest', direction)
  }

  // 6. Confirmation: first continuation candle after the retest; a re-cross before it invalidates.
  let confirmIdx = -1
  for (let k = retestIdx + 1; k < c.length; k++) {
    const invalidated = isLong ? c[k]!.close < level : c[k]!.close > level
    if (invalidated) {
      results.set('confirmation', {
        id: 'confirmation',
        status: 'wait',
        detail: `Price closed back through level ${level} at bar ${k} after the retest; setup invalidated.`,
      })
      return finish('confirmation', direction)
    }
    if (confirmation(c.slice(0, k + 1), direction).status === 'pass') {
      confirmIdx = k
      break
    }
  }
  if (confirmIdx === -1) {
    results.set('confirmation', {
      id: 'confirmation',
      status: 'wait',
      detail: 'Retest held but no confirmation candle in the breakout direction yet.',
    })
    return finish('confirmation', direction)
  }
  results.set('confirmation', confirmation(c.slice(0, confirmIdx + 1), direction))

  // 7. Risk:reward — entry = latest close; SL = the broken level (structural invalidation).
  const entry = c[c.length - 1]!.close
  const sl = level
  const slDistance = Math.abs(entry - sl)
  const nextSR = opposingLevel(c, direction, entry)
  const { tp1, tp2 } = takeProfits(entry, slDistance, direction, nextSR)
  const rr = riskReward(entry, sl, tp2, direction, config)
  results.set('risk-reward', rr)
  if (rr.status !== 'pass') return finish('risk-reward', direction)

  const gates = ORDER.map((id) => results.get(id)!)
  const vetoResults = vetoes(gates, config)
  if (vetoResults.some((v) => v.status === 'fail')) return finish('veto', direction)

  const lot = positionSize(config.accountSize, config.riskPct, slDistance, config.contractSize)
  return { status: 'setup', direction, level, entry, sl, tp1, tp2, lot, gates, supporting, vetoes: vetoResults, score: score(gates, vetoResults, true, supporting) }
}
```

- [ ] **Step 4: Update `evaluateSetup.test.ts` — the order + market-structure + band assertions**

(a) Replace the "always reports one GateResult per checklist row, in order" body (lines ~120-126) — 7 gates now:

```ts
    expect(v.gates.map((g) => g.id)).toEqual([
      'h1-m15-bias', 'consolidation', 'level-id',
      'breakout-close', 'retest', 'confirmation', 'risk-reward',
    ])
```

(b) In the full-narrative setup test (the `if (v.status === 'setup')` block, lines ~165-174), add band + supporting assertions right after `expect(v.score.authorized).toBe(true)`:

```ts
      // Both supporting confirmations agree (clean M15 structure + rising EMA9) → STRONG.
      expect(v.supporting.find((s) => s.id === 'market-structure')?.status).toBe('pass')
      expect(v.supporting.find((s) => s.id === 'ema9-alignment')?.status).toBe('pass')
      expect(v.score.band).toBe('strong')
```

(c) Replace the entire "blocks at market-structure when H1 bias is long but M15 structure independently disagrees" test (lines ~197-211) with the new non-blocking behavior:

```ts
  it('does NOT block when M15 structure disagrees — it authorizes with a lowered (building) band', () => {
    const h1 = trendSeries('up', 6) // bias long + rising EMA9 → EMA9 supporting passes
    const m15 = rangeSeries() // M15 structure does NOT confirm long → that supporting check is withheld
    const m5 = fullNarrative()
    const cfg = defaultConfig

    // Preconditions: bias long from H1, but M15 structure independently does not confirm.
    expect(bias({ m5, m15, h1 }).direction).toBe('long')
    expect(structure(m15, 'long').status).not.toBe('pass')

    const v = evaluateSetup({ m5, m15, h1 }, cfg)
    expect(v.status).toBe('setup') // M15 structure is supporting now — it never blocks
    if (v.status === 'setup') {
      expect(v.score.authorized).toBe(true)
      expect(v.supporting.find((s) => s.id === 'market-structure')?.status).not.toBe('pass')
      expect(v.score.band).toBe('building') // authorized, but a supporting confirmation is missing
    }
  })
```

(d) Confirm the three `bias(...)` calls in this file are 1-arg (done in Task 2 Step 7 if not already): `bias({ m5, m15, h1 })` and `bias(ctx)`.

- [ ] **Step 5: Update `vetoes.test.ts` — 7-gate order, drop the market-structure cases**

(a) Replace `GATE_ORDER` (lines ~70-79) with the 7 hard gates:

```ts
const GATE_ORDER = [
  'h1-m15-bias',
  'consolidation',
  'level-id',
  'breakout-close',
  'retest',
  'confirmation',
  'risk-reward',
] as const
```

(b) In the "bias is the blocker" test (lines ~129-152), remove the `'market-structure': 'wait',` line from the `gatesWith({...})` overrides (that key no longer exists in `GATE_ORDER`).

(c) Delete the whole "market-structure blocks → NO wired veto fires" test (lines ~163-191): after the reframe every hard gate maps 1:1 to a wired veto, so there is no unmapped-gate-in-order case to exercise. The `no-false-clear guard` test (unmatched gate id) still covers the `gi === -1` path.

(d) In the "deferred vetoes never return fail" scenarios array (lines ~249-255), delete the `gatesWith({ 'market-structure': 'fail' })` line.

- [ ] **Step 6: Run the engine tests**

Run: `npm test -- src/scoring`
Expected: PASS — `score`, `evaluateSetup`, `vetoes`, `risk` all green.

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck && npx eslint . && npm test -- src/scoring
git add src/scoring/score.ts src/scoring/score.test.ts src/scoring/evaluateSetup.ts src/scoring/evaluateSetup.test.ts src/scoring/vetoes.test.ts
git commit -m "feat: reframe engine into hard filters + supporting confirmations

M15 structure and EMA9 move out of the 8-gate AND-sequence into a
non-blocking supporting set; the confidence band now means authorized +
supporting agreement (strong) vs authorized-only (building).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: labels + 3-layer Checklist UI

**Files:**
- Modify: `src/ui/labels.ts`
- Modify: `src/ui/Checklist.tsx`
- Test: `src/ui/Checklist.test.tsx`

**Interfaces:**
- Produces: `PHASE1_GATES` (7 hard gates), `SUPPORTING_GATES: GateDef[]` (`market-structure` → "M15 structure", `ema9-alignment` → "EMA9 alignment"), `CHECKLIST_LAYERS: { title: string; ids: string[] }[]`. `gateName(id)` resolves hard + supporting ids.
- Consumes: `Checklist` reads `CHECKLIST_LAYERS` + `gateName`.

- [ ] **Step 1: Update `labels.ts`**

Replace `PHASE1_GATES` (lines ~22-31) and the `GATE_NAME` construction (line ~33) with:

```ts
export const PHASE1_GATES: GateDef[] = [
  { id: 'h1-m15-bias', name: 'H1 bias / direction' },
  { id: 'consolidation', name: 'Consolidation before break' },
  { id: 'level-id', name: 'Resistance level identified' },
  { id: 'breakout-close', name: 'Breakout close (not wick)' },
  { id: 'retest', name: 'Retest of level' },
  { id: 'confirmation', name: 'Confirmation candle' },
  { id: 'risk-reward', name: 'Reward : Risk ≥ 1.5' },
]

/** Supporting confirmations — evaluated but never blocking; shown beside the band. */
export const SUPPORTING_GATES: GateDef[] = [
  { id: 'market-structure', name: 'M15 structure' },
  { id: 'ema9-alignment', name: 'EMA9 alignment' },
]

/** The review's three layers, grouping the 7 hard filters for the checklist. */
export type ChecklistLayer = { title: string; ids: string[] }
export const CHECKLIST_LAYERS: ChecklistLayer[] = [
  { title: 'Market Filter', ids: ['h1-m15-bias', 'consolidation', 'level-id'] },
  { title: 'Setup', ids: ['breakout-close', 'retest'] },
  { title: 'Trigger', ids: ['confirmation', 'risk-reward'] },
]

const GATE_NAME = new Map([...PHASE1_GATES, ...SUPPORTING_GATES].map((g) => [g.id, g.name]))
```

- [ ] **Step 2: Rewrite `Checklist.tsx` to render the 3 layers**

```tsx
import type { ReactElement } from 'react'
import type { GateResult } from '../types'
import { CHECKLIST_LAYERS, gateName } from './labels'
import { StatusIcon, StatusLabel } from './status'

/**
 * The live checklist (docs/ui-spec.md §2/§3), grouped into the review's three layers —
 * Market Filter / Setup / Trigger. One numbered row per hard-filter gate, in process
 * order, showing icon + name + detail + label. Pure and prop-driven — it consumes the
 * SAME hard-filter `GateResult[]` the Score meter reads. Supporting confirmations are
 * shown beside the band (in Score), not here — they never block.
 */
export function Checklist({ gates }: { gates: GateResult[] }): ReactElement {
  const byId = new Map(gates.map((g) => [g.id, g]))
  let row = 0
  return (
    <section
      className="mt-4 rounded-panel border border-border bg-surface shadow-panel"
      aria-label="Live checklist"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-[18px] py-[15px] pb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">Live Checklist</h2>
        <span className="font-mono text-[12px] text-ink-2">Market filter → Setup → Trigger</span>
      </div>

      {CHECKLIST_LAYERS.map((layer) => {
        const layerGates = layer.ids
          .map((id) => byId.get(id))
          .filter((g): g is GateResult => g !== undefined)
        if (layerGates.length === 0) return null
        return (
          <div key={layer.title}>
            <div className="border-b border-border bg-surface-sunken px-[18px] py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
              {layer.title}
            </div>
            <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
              {layerGates.map((gate) => {
                row += 1
                return (
                  <div
                    key={gate.id}
                    className="grid grid-cols-[26px_auto_1fr_auto] items-center gap-3 bg-surface px-4 py-[13px]"
                  >
                    <span className="font-mono text-[11px] tabular-nums text-ink-3">
                      {String(row).padStart(2, '0')}
                    </span>
                    <StatusIcon status={gate.status} />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-ink">{gateName(gate.id)}</div>
                      <div className="mt-0.5 text-[12px] text-ink-2">{gate.detail}</div>
                    </div>
                    <StatusLabel status={gate.status} />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}
```

- [ ] **Step 3: Update `Checklist.test.tsx`**

Change the friendly-name assertion (line ~13) and add a layer-header assertion. Replace the first test with:

```tsx
test('renders one numbered row per gate with its friendly name and detail, under its layer', () => {
  render(<Checklist gates={gates} />)
  expect(screen.getByText('H1 bias / direction')).toBeInTheDocument()
  expect(screen.getByText('Reward : Risk ≥ 1.5')).toBeInTheDocument()
  expect(screen.getByText('Both timeframes bullish')).toBeInTheDocument()
  // Continuous numbering across the layer groups.
  expect(screen.getByText('01')).toBeInTheDocument()
  expect(screen.getByText('03')).toBeInTheDocument()
  // Layer headers present.
  expect(screen.getByText('Market Filter')).toBeInTheDocument()
  expect(screen.getByText('Trigger')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run the UI tests**

Run: `npm test -- src/ui/Checklist.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
npm run typecheck && npx eslint . && npm test -- src/ui/Checklist.test.tsx
git add src/ui/labels.ts src/ui/Checklist.tsx src/ui/Checklist.test.tsx
git commit -m "feat: group checklist into Market/Setup/Trigger layers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Score supporting chips + App wiring

**Files:**
- Modify: `src/ui/Score.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/Score.test.tsx`

**Interfaces:**
- Consumes: `SetupVerdict.supporting` (Task 3), `gateName` (Task 4).
- Produces: `Score` accepts `supporting?: GateResult[]`; renders each as a chip (pass = ✓ tinted, else = ○ muted). `total` defaults to 7.

- [ ] **Step 1: Add the supporting prop + chips to `Score.tsx`**

Update the imports at the top to include `gateName`:

```tsx
import { STATUS_LABEL, STATUS_TONE } from './status-tokens'
import { gateName } from './labels'
```

Change the component signature/defaults (lines ~42-52):

```tsx
export function Score({
  score,
  gates,
  verdict,
  total = 7,
  supporting = [],
}: {
  score: ScoreValue
  gates: GateResult[]
  verdict: string
  total?: number
  supporting?: GateResult[]
}): ReactElement {
```

Inside the "Band verdict" column, immediately after the `{score.passed} of {total} confirmations` span (the closing `</span>` around line ~72), insert:

```tsx
        {supporting.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">Support</span>
            {supporting.map((s) => (
              <span
                key={s.id}
                className={`inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-[10.5px] font-semibold ${
                  s.status === 'pass'
                    ? 'border-pass-bd bg-pass-bg text-pass-fg'
                    : 'border-border bg-surface-sunken text-ink-3'
                }`}
                title={s.detail}
              >
                <span aria-hidden="true">{s.status === 'pass' ? '✓' : '○'}</span>
                {gateName(s.id)}
              </span>
            ))}
          </div>
        )}
```

- [ ] **Step 2: Wire `App.tsx` to pass supporting**

Change the `<Score .../>` usage (line ~206) to include `supporting`:

```tsx
        <Score score={signal} gates={gates} verdict={verdict} total={gates.length} supporting={result.supporting} />
```

- [ ] **Step 3: Add a supporting-chips test to `Score.test.tsx`**

Append:

```tsx
test('renders supporting confirmations beside the band with pass/withheld glyphs', () => {
  render(
    <Score
      score={{ passed: 7, band: 'strong', authorized: true }}
      gates={gatesWith(7, 7)}
      verdict="Authorized."
      total={7}
      supporting={[
        { id: 'market-structure', status: 'pass', detail: 'M15 confirms long' },
        { id: 'ema9-alignment', status: 'wait', detail: 'EMA9 flat' },
      ]}
    />,
  )
  expect(screen.getByText('M15 structure')).toBeInTheDocument()
  expect(screen.getByText('EMA9 alignment')).toBeInTheDocument()
  expect(screen.getByText('Support')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run the affected UI tests**

Run: `npm test -- src/ui/Score.test.tsx src/App.test.tsx`
Expected: PASS. (App.test asserts `WAIT`, `Awaiting setup`, `1 active` — all unchanged by this pass, since a bias-blocked ctx still fires exactly one veto and shows WAIT.)

- [ ] **Step 5: Typecheck + lint + commit**

```bash
npm run typecheck && npx eslint . && npm test -- src/ui/Score.test.tsx src/App.test.tsx
git add src/ui/Score.tsx src/ui/Score.test.tsx src/App.tsx
git commit -m "feat: show supporting confirmations beside the confidence band

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full verification + demo smoke

**Files:** none expected (verification only; touch code only if something surfaces).

- [ ] **Step 1: Full suite green**

Run: `npm run typecheck && npx eslint . && npm test`
Expected: typecheck clean, eslint clean, ALL tests pass. Note the total count (was 188 before this plan; expect a modest change — Task 1 adds 5, Task 3/others swap several).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Demo smoke (manual, via the run skill or `npm run dev`)**

Verify in the browser with the demo toggle:
- **SETUP preset** → TradeCard fills, band lozenge reads **STRONG**, and the two supporting chips (M15 structure, EMA9 alignment) render as ✓ beside the band.
- **Building preset** → band **WAIT** (not authorized), checklist blocked at `retest`, supporting chips still visible.
- **WAIT preset** → band **WAIT**, blocked at `H1 bias / direction`.
- Checklist shows the three layer headers: Market Filter / Setup / Trigger.

If SETUP does not read STRONG, inspect its supporting results (`market-structure`/`ema9-alignment`); the preset was built to pass all 8 original gates, so both should pass — if one is withheld, note it (do not force a preset change without confirming with Luis).

- [ ] **Step 4: Update the reframe spec status + commit any doc note**

If a `NORTHMARK-STATUS.md` exists, add a line that the strategy reframe shipped. Commit:

```bash
git add -A
git commit -m "chore: strategy reframe verified (suite + build + demo smoke)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Audit (M15 structure + EMA9 → supporting; redundancy removed) → Tasks 1–3. ✓
- Hard filters block, supporting never block → Task 3 `evaluateSetup`/`score`. ✓
- Band meaningful (strong/building/wait) → Task 3 `score`. ✓
- No "enough supporting" gate; supporting never emits a veto → Task 3 (supporting not passed to `vetoes`), `score`. ✓
- Checklist 3-layer grouping → Task 4. ✓
- Supporting shown beside band → Task 5. ✓
- Non-goals (no volume/Jason/FVG/FCR/M1/Path B) → honored; not implemented. ✓
- Testing impact (bias split, evaluateSetup band cases, score band, UI) → Tasks 1–5 tests. ✓

**Placeholder scan:** none — every step shows concrete code/commands.

**Type consistency:** `emaAlignment(ctx, direction, config)` id `'ema9-alignment'` used identically in Task 1, 3, 4, 5. `supporting: GateResult[]` on `SetupVerdict` (Task 3) consumed by `App`/`Score` (Task 5). `CHECKLIST_LAYERS`/`SUPPORTING_GATES` defined in Task 4, consumed by `Checklist`/`Score`. `score(gates, vetoes, authorized, supporting)` signature consistent between `score.ts`, its tests, and `evaluateSetup`. ✓
