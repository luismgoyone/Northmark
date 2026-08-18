# Northmark Phase 2 — Heuristic Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed by the Northmark 7-agent team via `/loop`; `engine-engineer` implements, `qa` writes/runs tests, `quant-reviewer` gates every gate/scoring file against `docs/checklist.md`, `architect` gates `types.ts`/`config.ts` and import direction. Each task ends in a commit and a `NORTHMARK-STATUS.md` checkpoint.

**Goal:** Add the judgment gates (bias, structure, consolidation, level-ID, retest, confirmation) and replace the Phase-1 soft-tally with a hard required-gate sequence that authorizes SETUP vs WAIT, then wire it into the live UI so the checklist and trade card fill with a real candidate setup.

**Architecture:** Pure, no-I/O gates under `src/gates/`, reasoning only over the candle window already in `MarketContext`. A new `scoring/evaluateSetup.ts` runs the required gates in the checklist's order and short-circuits to WAIT on the first non-pass; the band/score is demoted to a display-only readout. Direction (`'long' | 'short'`) is a first-class type threaded from the bias gate through every directional gate and the risk math. Import direction stays one-way downward (`ui → hooks → data/scoring → gates → indicators → types`).

**Tech Stack:** TypeScript (strict + `noUncheckedIndexedAccess`), Vitest, React 18, Vite, Tailwind. No new dependencies.

## Global Constraints

- **TypeScript strict** + `noUncheckedIndexedAccess` — index candle arrays defensively (`arr[i]` is `T | undefined`).
- **Import direction one-way downward** — gates import only from `indicators`/`types`; scoring imports from `gates`/`indicators`/`types`; nothing lower imports anything higher.
- **Gates are pure, no I/O** — the only I/O is `src/data/`.
- **Canonical `Candle`:** `{ time: number; open: number; high: number; low: number; close: number; volume?: number }`.
- **Bias toward WAIT** — a gate never returns a false `pass`/`setup`. When inputs are insufficient, return `wait`.
- **No arbitrary thresholds** (checklist Critical Implementation Principle) — consolidation and the breakout buffer derive from price behavior/structure; config values are *bounds*, not the rule. Any new numeric constant needs a one-line justification comment.
- **XAUUSD pip convention** — 0.01 per pip; buffers expressed in **price units**, never dollars.
- **Every gate/scoring task passes `quant-reviewer`** (checklist fidelity) before "done"; every types/config task passes `architect`.
- **Commit per completed task**, then checkpoint `NORTHMARK-STATUS.md` (silent).
- **Gate ids are load-bearing** — they must equal the ids in `src/ui/labels.ts::PHASE1_GATES` so the existing checklist rows fill: `h1-m15-bias`, `market-structure`, `consolidation`, `level-id`, `breakout-close`, `retest`, `confirmation`, `ema9`, `stochastic`, `risk-reward`.

---

## File Structure

```
src/
├─ types.ts                    # MODIFY: add `Direction`
├─ config.ts                   # MODIFY: reframe tolerance comments as bounds (no value churn)
├─ gates/
│  ├─ structure.ts             # NEW (T2.1): structureDirection() + structure()
│  ├─ bias.ts                  # NEW (T2.5): bias() → { result, direction }
│  ├─ levelId.ts               # NEW (T2.0): levelId() → { level, result }
│  ├─ consolidation.ts         # NEW (T2.2): consolidation()
│  ├─ retest.ts                # NEW (T2.3): retest()
│  ├─ confirmation.ts          # NEW (T2.4): confirmation()
│  ├─ breakoutClose.ts         # MODIFY (R1): direction-aware, price-unit buffer, drop PIP=0.1
│  └─ riskReward.ts            # MODIFY (R2): direction-aware
├─ scoring/
│  ├─ risk.ts                  # MODIFY (R3): direction-aware takeProfits + non-finite guard
│  ├─ score.ts                 # MODIFY (T2.6): add `authorized`
│  └─ evaluateSetup.ts         # NEW (T2.6): the required-gate sequence
├─ ui/
│  └─ labels.ts                # (unchanged ids; verify only)
├─ App.tsx                     # MODIFY (T2.6): consume evaluateSetup, fill checklist/trade card
tests/fixtures/
│  └─ structureSeries.ts       # NEW (T2.1): candle builders for trend/range/retest fixtures
```

Test files sit next to each source file (`*.test.ts`), per the Phase-1 convention.

---

## Task 2.0T: Foundation — `Direction` type + config reframe

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Test: `src/config.test.ts` (create if absent)

**Interfaces:**
- Produces: `export type Direction = 'long' | 'short'` (consumed by every later task).

- [ ] **Step 1: Add the `Direction` type.** In `src/types.ts`, after `GateStatus`:

```ts
export type Direction = 'long' | 'short'
```

- [ ] **Step 2: Reframe the config tolerance comment (no value change).** In `src/config.ts`, replace the `tolerances` comment block with:

```ts
  // Structure-driven bounds (checklist Critical Implementation Principle — NOT magic
  // triggers). retestBand: max fractional distance (0.05% of price) that still counts as
  // "touching" the level. breakoutBufferPips: UPPER BOUND on the price-unit breakout buffer
  // (0.01/pip XAUUSD convention → 20 pips = 0.20 price); the gate scales within this bound to
  // recent range, never a fixed pip magnitude. consolidationLookback: MAX window (candles)
  // the consolidation gate inspects, not a fixed "N flat candles = range" rule. All UNVALIDATED
  // until calibrated against past charts (Luis owns calibration before live signals are trusted).
  tolerances: { retestBand: 0.0005, breakoutBufferPips: 20, consolidationLookback: 20 },
```

- [ ] **Step 3: Assert config shape holds.** Create `src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { defaultConfig } from './config'

describe('defaultConfig', () => {
  it('keeps the structure-driven tolerance bounds', () => {
    expect(defaultConfig.tolerances.retestBand).toBe(0.0005)
    expect(defaultConfig.tolerances.breakoutBufferPips).toBe(20)
    expect(defaultConfig.tolerances.consolidationLookback).toBe(20)
  })
})
```

- [ ] **Step 4: Verify.** Run `npm run typecheck` (expect pass) and `npx vitest run src/config.test.ts` (expect PASS).
- [ ] **Step 5: `architect` gate**, then commit:

```bash
git add src/types.ts src/config.ts src/config.test.ts
git commit -m "feat: add Direction type + reframe tolerances as structure-driven bounds"
```

---

## Task 2.1: Structure gate (`market-structure`)

Classifies raw fractals from `swingPoints` into a trend direction and validates the ≥2 HH + 2 HL (long) / 2 LH + 2 LL (short) requirement on **H1**.

**Files:**
- Create: `src/gates/structure.ts`
- Create: `tests/fixtures/structureSeries.ts`
- Test: `src/gates/structure.test.ts`

**Interfaces:**
- Consumes: `swingPoints(candles): { highs: number[]; lows: number[] }` from `src/indicators/swingPoints.ts`; `Candle`, `Direction`, `GateResult`.
- Produces:
  - `structureDirection(candles: Candle[]): Direction | null` — `long` if the last ≥2 swing highs strictly increase AND the last ≥2 swing lows strictly increase; `short` if both strictly decrease; else `null` (unclear/mixed).
  - `structure(candles: Candle[], direction: Direction): GateResult` — `id: 'market-structure'`, `pass` iff `structureDirection(candles) === direction`, else `wait`.

- [ ] **Step 1: Write the fixture builder.** Create `tests/fixtures/structureSeries.ts`:

```ts
import type { Candle } from '../../src/types'

/** Build a candle from a center price; high/low straddle it by `spread`. */
function bar(time: number, center: number, spread = 1): Candle {
  return { time, open: center, high: center + spread, low: center - spread, close: center }
}

/**
 * A clean up-staircase: alternating pivot-high / pivot-low bars whose highs and lows
 * both strictly increase, so swingPoints yields increasing HH and HL. Reverse for down.
 */
export function trendSeries(direction: 'up' | 'down', legs = 4): Candle[] {
  const out: Candle[] = []
  const step = direction === 'up' ? 4 : -4
  let center = 1000
  for (let i = 0; i < legs * 2 + 3; i++) {
    // Zig-zag: even bars are local highs, odd bars are local lows, drifting by `step` per pair.
    const isHigh = i % 2 === 0
    const local = center + (isHigh ? 6 : -6)
    out.push(bar(i, local))
    if (!isHigh) center += step
  }
  return out
}

/** A flat, overlapping range: all bars share one center, no directional progression. */
export function rangeSeries(count = 20): Candle[] {
  return Array.from({ length: count }, (_v, i) => bar(i, 1000, 3))
}
```

- [ ] **Step 2: Write the failing test.** Create `src/gates/structure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { structure, structureDirection } from './structure'
import { rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'

describe('structureDirection', () => {
  it('reads a rising staircase as long', () => {
    expect(structureDirection(trendSeries('up'))).toBe('long')
  })
  it('reads a falling staircase as short', () => {
    expect(structureDirection(trendSeries('down'))).toBe('short')
  })
  it('returns null for an overlapping range', () => {
    expect(structureDirection(rangeSeries())).toBeNull()
  })
})

describe('structure', () => {
  it('passes when the requested direction matches the detected structure', () => {
    const r = structure(trendSeries('up'), 'long')
    expect(r.id).toBe('market-structure')
    expect(r.status).toBe('pass')
  })
  it('waits when the requested direction contradicts the structure', () => {
    expect(structure(trendSeries('up'), 'short').status).toBe('wait')
  })
})
```

- [ ] **Step 3: Run → fail.** `npx vitest run src/gates/structure.test.ts` → FAIL ("structure is not a function").

- [ ] **Step 4: Implement.** Create `src/gates/structure.ts`:

```ts
import type { Candle, Direction, GateResult } from '../types'
import { swingPoints } from '../indicators/swingPoints'

/** Are the last `min` values strictly increasing? (needs ≥ `min` values) */
function strictlyIncreasing(values: number[], min = 2): boolean {
  if (values.length < min) return false
  const tail = values.slice(-min)
  return tail.every((v, i) => i === 0 || v > tail[i - 1]!)
}

function strictlyDecreasing(values: number[], min = 2): boolean {
  if (values.length < min) return false
  const tail = values.slice(-min)
  return tail.every((v, i) => i === 0 || v < tail[i - 1]!)
}

/**
 * Direction implied by market structure, or null when unclear.
 * Long  = last ≥2 swing highs AND last ≥2 swing lows both strictly increase (HH + HL).
 * Short = both strictly decrease (LH + LL). Anything mixed/insufficient → null.
 */
export function structureDirection(candles: Candle[]): Direction | null {
  const { highs, lows } = swingPoints(candles)
  const highPrices = highs.map((i) => candles[i]!.high)
  const lowPrices = lows.map((i) => candles[i]!.low)

  if (strictlyIncreasing(highPrices) && strictlyIncreasing(lowPrices)) return 'long'
  if (strictlyDecreasing(highPrices) && strictlyDecreasing(lowPrices)) return 'short'
  return null
}

/** Gate: structure confirms the candidate `direction` (≥2 HH+HL / 2 LH+LL). */
export function structure(candles: Candle[], direction: Direction): GateResult {
  const id = 'market-structure'
  const detected = structureDirection(candles)
  if (detected === direction) {
    return { id, status: 'pass', detail: `H1 structure confirms ${direction} (2+ ${direction === 'long' ? 'HH+HL' : 'LH+LL'}).` }
  }
  return { id, status: 'wait', detail: `H1 structure is ${detected ?? 'unclear'}, not the candidate ${direction}. No trade.` }
}
```

- [ ] **Step 5: Run → pass.** `npx vitest run src/gates/structure.test.ts` → PASS (5 tests).
- [ ] **Step 6: `quant-reviewer` + `architect` gate**, then commit:

```bash
git add src/gates/structure.ts src/gates/structure.test.ts tests/fixtures/structureSeries.ts
git commit -m "feat: add market-structure gate (HH/HL / LH/LL classification)"
```

---

## Task 2.5: Bias gate (`h1-m15-bias`)

Determines the primary `Direction` from H1 structure (EMA9 supports but never overrides), emitting the direction the rest of the sequence uses. Runs first in `evaluateSetup`.

**Files:**
- Create: `src/gates/bias.ts`
- Test: `src/gates/bias.test.ts`

**Interfaces:**
- Consumes: `structureDirection` (T2.1); `ema(candles, period): { value; slope }` (`src/indicators/ema.ts`); `MarketContext`, `Config`, `Direction`, `GateResult`.
- Produces: `bias(ctx: MarketContext, config: Config): { result: GateResult; direction: Direction | null }` — `id: 'h1-m15-bias'`. `pass` + a non-null direction when H1 structure is clear and EMA9 slope does not strongly contradict it; `wait` + `null` when H1 direction is unclear.

- [ ] **Step 1: Write the failing test.** Create `src/gates/bias.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bias } from './bias'
import { defaultConfig } from '../config'
import { rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'
import type { MarketContext } from '../types'

const ctxWith = (h1: MarketContext['h1']): MarketContext => ({ m5: h1, m15: h1, h1 })

describe('bias', () => {
  it('emits long when H1 structure rises and EMA9 does not contradict', () => {
    const { result, direction } = bias(ctxWith(trendSeries('up')), defaultConfig)
    expect(result.id).toBe('h1-m15-bias')
    expect(result.status).toBe('pass')
    expect(direction).toBe('long')
  })

  it('emits short for a falling H1', () => {
    const { direction } = bias(ctxWith(trendSeries('down')), defaultConfig)
    expect(direction).toBe('short')
  })

  it('waits with null direction when H1 is an unclear range', () => {
    const { result, direction } = bias(ctxWith(rangeSeries()), defaultConfig)
    expect(result.status).toBe('wait')
    expect(direction).toBeNull()
  })
})
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/gates/bias.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Create `src/gates/bias.ts`:

```ts
import type { Config, Direction, GateResult, MarketContext } from '../types'
import { ema } from '../indicators/ema'
import { structureDirection } from './structure'

/**
 * Primary bias from H1 structure. EMA9 slope may SUPPORT but never OVERRIDE clear
 * structure (checklist step 1): we only veto when EMA9 slope strongly opposes the
 * structural direction (rising structure + falling EMA9, or vice versa).
 */
export function bias(ctx: MarketContext, config: Config): { result: GateResult; direction: Direction | null } {
  const id = 'h1-m15-bias'
  const direction = structureDirection(ctx.h1)

  if (direction === null) {
    return { result: { id, status: 'wait', detail: 'H1 direction is unclear (no clean HH/HL or LH/LL). No trade.' }, direction: null }
  }

  const { slope } = ema(ctx.h1, config.ema.period)
  const contradicts = (direction === 'long' && slope === 'falling') || (direction === 'short' && slope === 'rising')
  if (contradicts) {
    return { result: { id, status: 'wait', detail: `H1 structure is ${direction} but EMA9 slope (${slope}) strongly disagrees. No trade.` }, direction: null }
  }

  return { result: { id, status: 'pass', detail: `H1 bias ${direction}; EMA9 slope ${slope} supports (or is neutral).` }, direction }
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run src/gates/bias.test.ts` → PASS.
- [ ] **Step 5: `quant-reviewer` + `architect` gate**, then commit:

```bash
git add src/gates/bias.ts src/gates/bias.test.ts
git commit -m "feat: add H1 bias gate emitting trade direction"
```

---

## Task 2.0: Level-ID gate (`level-id`)

Identifies the significant swing level price must break — nearest confirmed swing high **above** current price (long) / swing low **below** (short). Feeds breakout and retest.

**Files:**
- Create: `src/gates/levelId.ts`
- Test: `src/gates/levelId.test.ts`

**Interfaces:**
- Consumes: `swingPoints` (indicators); `Candle`, `Direction`, `GateResult`.
- Produces: `levelId(candles: Candle[], direction: Direction): { level: number | null; result: GateResult }` — `id: 'level-id'`. `level` = the nearest confirmed swing high above the last close (long) / swing low below (short); `pass` when found, `wait` + `null` when no significant level exists.

- [ ] **Step 1: Write the failing test.** Create `src/gates/levelId.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { levelId } from './levelId'
import type { Candle } from '../types'

/** Two prior swing highs at 1010 and 1020, price now resting at 1005 below both. */
const belowResistance: Candle[] = [
  { time: 0, open: 1000, high: 1002, low: 998, close: 1000 },
  { time: 1, open: 1001, high: 1003, low: 999, close: 1001 },
  { time: 2, open: 1008, high: 1010, low: 1006, close: 1008 }, // swing high 1010
  { time: 3, open: 1004, high: 1006, low: 1002, close: 1004 },
  { time: 4, open: 1003, high: 1005, low: 1001, close: 1003 },
  { time: 5, open: 1018, high: 1020, low: 1016, close: 1018 }, // swing high 1020
  { time: 6, open: 1006, high: 1008, low: 1004, close: 1006 },
  { time: 7, open: 1005, high: 1007, low: 1003, close: 1005 }, // last close 1005
]

describe('levelId', () => {
  it('picks the nearest swing high above price for a long', () => {
    const { level, result } = levelId(belowResistance, 'long')
    expect(result.id).toBe('level-id')
    expect(result.status).toBe('pass')
    expect(level).toBe(1010) // nearest of {1010, 1020} above close 1005
  })

  it('waits with null when no swing sits above price', () => {
    const rising = belowResistance.map((c) => ({ ...c, close: 9999 }))
    const { level, result } = levelId(rising, 'long')
    expect(level).toBeNull()
    expect(result.status).toBe('wait')
  })
})
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/gates/levelId.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Create `src/gates/levelId.ts`:

```ts
import type { Candle, Direction, GateResult } from '../types'
import { swingPoints } from '../indicators/swingPoints'

/**
 * The significant level price must break for `direction`:
 *   long  → nearest confirmed swing HIGH strictly above the last close
 *   short → nearest confirmed swing LOW strictly below the last close
 * "Significant" = an actual confirmed swing point (from swingPoints), not every fractal —
 * the nearest one in the breakout direction is the wall the setup is built on.
 */
export function levelId(candles: Candle[], direction: Direction): { level: number | null; result: GateResult } {
  const id = 'level-id'
  const last = candles[candles.length - 1]
  if (!last) return { level: null, result: { id, status: 'wait', detail: 'No candles; cannot identify a level.' } }

  const { highs, lows } = swingPoints(candles)

  let level: number | null = null
  if (direction === 'long') {
    const above = highs.map((i) => candles[i]!.high).filter((h) => h > last.close)
    level = above.length ? Math.min(...above) : null
  } else {
    const below = lows.map((i) => candles[i]!.low).filter((l) => l < last.close)
    level = below.length ? Math.max(...below) : null
  }

  if (level === null) {
    return { level: null, result: { id, status: 'wait', detail: `No significant ${direction === 'long' ? 'resistance above' : 'support below'} price ${last.close}. No trade.` } }
  }
  return { level, result: { id, status: 'pass', detail: `Significant ${direction === 'long' ? 'resistance' : 'support'} level ${level} identified for a ${direction} break.` } }
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run src/gates/levelId.test.ts` → PASS.
- [ ] **Step 5: `quant-reviewer` + `architect` gate**, then commit:

```bash
git add src/gates/levelId.ts src/gates/levelId.test.ts
git commit -m "feat: add level-ID gate (nearest significant swing level)"
```

---

## Task 2.2: Consolidation gate (`consolidation`)

Structure-driven range detection — overlapping bodies + flat EMA9 + price mid-range. Returns `fail` (a NO-TRADE) when consolidating, `pass` when there is clean progression. **No fixed candle-count trigger.**

**Files:**
- Create: `src/gates/consolidation.ts`
- Test: `src/gates/consolidation.test.ts`

**Interfaces:**
- Consumes: `ema` (indicators); `swingPoints` (indicators); `Candle`, `Config`, `GateResult`.
- Produces: `consolidation(candles: Candle[], config: Config): GateResult` — `id: 'consolidation'`. `fail` when ALL three range signals hold within the `consolidationLookback` window; `pass` otherwise.

- [ ] **Step 1: Write the failing test.** Create `src/gates/consolidation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { consolidation } from './consolidation'
import { defaultConfig } from '../config'
import { rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'

describe('consolidation', () => {
  it('fails (NO-TRADE) on a flat overlapping range', () => {
    const r = consolidation(rangeSeries(20), defaultConfig)
    expect(r.id).toBe('consolidation')
    expect(r.status).toBe('fail')
  })
  it('passes on a clean directional trend', () => {
    expect(consolidation(trendSeries('up', 6), defaultConfig).status).toBe('pass')
  })
})
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/gates/consolidation.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Create `src/gates/consolidation.ts`:

```ts
import type { Candle, Config, GateResult } from '../types'
import { ema } from '../indicators/ema'

/**
 * Consolidation = a clear range, detected from PRICE BEHAVIOR (checklist step 3 + the
 * Critical Implementation Principle), never a fixed "N flat candles" rule. Three signals,
 * all required, over the last `consolidationLookback` bars (a MAX window bound):
 *   1. Overlapping bodies — the range of candle CLOSES is small vs the full high-low span.
 *   2. Flat EMA9 — `ema().slope === 'flat'` (the indicator's own volatility-aware epsilon).
 *   3. Mid-range price — the last close sits in the middle third of the window's high-low span.
 * When all three hold → `fail` (NO-TRADE). Otherwise clean progression → `pass`.
 */
export function consolidation(candles: Candle[], config: Config): GateResult {
  const id = 'consolidation'
  const period = config.ema.period
  if (candles.length < period) {
    return { id, status: 'wait', detail: `Need ≥${period} candles to judge consolidation, got ${candles.length}.` }
  }

  const window = candles.slice(-config.tolerances.consolidationLookback)
  const highs = window.map((c) => c.high)
  const lows = window.map((c) => c.low)
  const closes = window.map((c) => c.close)
  const top = Math.max(...highs)
  const bottom = Math.min(...lows)
  const span = top - bottom
  if (span <= 0) return { id, status: 'fail', detail: 'Zero-span window: fully overlapping bars — consolidation.' }

  // 1. Overlapping bodies: closes occupy a small fraction of the full span.
  const closeSpan = Math.max(...closes) - Math.min(...closes)
  const overlapping = closeSpan / span < 0.5 // closes cluster within half the range

  // 2. Flat EMA9 (volatility-aware epsilon lives in the indicator).
  const flat = ema(window, period).slope === 'flat'

  // 3. Mid-range: last close within the middle third of the span.
  const last = window[window.length - 1]!.close
  const pos = (last - bottom) / span
  const midRange = pos > 1 / 3 && pos < 2 / 3

  if (overlapping && flat && midRange) {
    return { id, status: 'fail', detail: `Consolidation: closes span ${(closeSpan / span).toFixed(2)} of range, EMA9 flat, price mid-range (${pos.toFixed(2)}). No trade.` }
  }
  return { id, status: 'pass', detail: `No consolidation (overlapping=${overlapping}, flat=${flat}, midRange=${midRange}): clean progression.` }
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run src/gates/consolidation.test.ts` → PASS. If `trendSeries('up', 6)` trips one signal, widen the trend's `step` in the fixture until EMA9 slope is clearly non-flat — do not loosen the gate.
- [ ] **Step 5: `quant-reviewer` + `architect` gate**, then commit:

```bash
git add src/gates/consolidation.ts src/gates/consolidation.test.ts
git commit -m "feat: add structure-driven consolidation gate"
```

---

## Task R1: Retrofit `breakoutClose` to be direction-aware

**Files:**
- Modify: `src/gates/breakoutClose.ts`
- Test: `src/gates/breakoutClose.test.ts` (extend)

**Interfaces:**
- Produces (new signature): `breakoutClose(candles: Candle[], level: number, direction: Direction, config: Config): GateResult` — `id: 'breakout-close'`. Long: `pass` iff last close > level + buffer; wick-only above → `fail`; no attempt → `wait`. Short mirrored (close < level − buffer). Buffer is **price units** derived from config, not `PIP`.

- [ ] **Step 1: Extend the test** in `src/gates/breakoutClose.test.ts` with a short case and drop any `PIP`-based expectation:

```ts
import type { Direction } from '../types'
// buffer in price units: breakoutBufferPips * 0.01 (0.01/pip XAUUSD convention)
const BUF = defaultConfig.tolerances.breakoutBufferPips * 0.01 // 0.20

it('short: passes when close is below level minus buffer', () => {
  const level = 1000
  const candles = [{ time: 0, open: 1000, high: 1000, low: 998, close: 1000 - BUF - 0.01 }]
  const r = breakoutClose(candles, level, 'short' as Direction, defaultConfig)
  expect(r.status).toBe('pass')
})

it('short: wick below but close inside is a failed breakout', () => {
  const level = 1000
  const candles = [{ time: 0, open: 1000, high: 1001, low: 990, close: 1000 - 0.01 }]
  expect(breakoutClose(candles, level, 'short' as Direction, defaultConfig).status).toBe('fail')
})
```

Update the existing long tests to pass `'long'` as the new third argument.

- [ ] **Step 2: Run → fail.** `npx vitest run src/gates/breakoutClose.test.ts` → FAIL (arity/PIP).

- [ ] **Step 3: Reimplement `src/gates/breakoutClose.ts`:**

```ts
import type { Candle, Config, Direction, GateResult } from '../types'

/** XAUUSD pip→price: 0.01 per pip (checklist Section A). Buffer stays in PRICE units. */
const PRICE_PER_PIP = 0.01

/**
 * Breakout-close gate (checklist step 5). A breakout counts ONLY when the last candle
 * *closes* beyond `level ± buffer`. A wick beyond with a close back inside = failed breakout.
 *   long:  close > level + buffer → pass;  high > level, close ≤ level+buffer → fail
 *   short: close < level − buffer → pass;  low  < level, close ≥ level−buffer → fail
 * `buffer` is a price-unit distance from config (breakoutBufferPips × 0.01), never dollars.
 */
export function breakoutClose(candles: Candle[], level: number, direction: Direction, config: Config): GateResult {
  const id = 'breakout-close'
  const last = candles[candles.length - 1]
  if (!last) return { id, status: 'wait', detail: 'No candles supplied; cannot evaluate breakout.' }

  const buffer = config.tolerances.breakoutBufferPips * PRICE_PER_PIP

  if (direction === 'long') {
    const threshold = level + buffer
    if (last.close > threshold) return { id, status: 'pass', detail: `Close ${last.close} > level ${level} + buffer ${buffer}: clean long breakout.` }
    if (last.high > level) return { id, status: 'fail', detail: `High ${last.high} pierced ${level} but close ${last.close} ≤ ${threshold}: wick-only, failed breakout.` }
    return { id, status: 'wait', detail: `High ${last.high} ≤ level ${level}: no long breakout attempt.` }
  }

  const threshold = level - buffer
  if (last.close < threshold) return { id, status: 'pass', detail: `Close ${last.close} < level ${level} − buffer ${buffer}: clean short breakout.` }
  if (last.low < level) return { id, status: 'fail', detail: `Low ${last.low} pierced ${level} but close ${last.close} ≥ ${threshold}: wick-only, failed breakout.` }
  return { id, status: 'wait', detail: `Low ${last.low} ≥ level ${level}: no short breakout attempt.` }
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run src/gates/breakoutClose.test.ts` → PASS.
- [ ] **Step 5: `quant-reviewer` gate** (confirm "close not wick", both directions, price-unit buffer), then commit:

```bash
git add src/gates/breakoutClose.ts src/gates/breakoutClose.test.ts
git commit -m "refactor: make breakout-close gate direction-aware, drop hardcoded pip"
```

---

## Task 2.3: Retest gate (`retest`)

After an in-window confirmed breakout, price must return to the broken level and hold it (former resistance→support / support→resistance) within `retestBand`.

**Files:**
- Create: `src/gates/retest.ts`
- Test: `src/gates/retest.test.ts`

**Interfaces:**
- Consumes: `Candle`, `Config`, `Direction`, `GateResult`.
- Produces: `retest(candles: Candle[], level: number, direction: Direction, config: Config): GateResult` — `id: 'retest'`. Scans for a bar that closed beyond the level (the breakout), then a later bar that returned to within `retestBand` of the level and held (long: low touched band, close stayed ≥ level; short: high touched band, close stayed ≤ level). `pass` on a holding retest, `fail` on a return that broke back through, `wait` if no retest yet.

- [ ] **Step 1: Write the failing test.** Create `src/gates/retest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { retest } from './retest'
import { defaultConfig } from '../config'
import type { Candle } from '../types'

const level = 1000
// breakout up to 1005, pull back to touch 1000 and hold (close 1001).
const holds: Candle[] = [
  { time: 0, open: 998, high: 999, low: 997, close: 998 },
  { time: 1, open: 1004, high: 1006, low: 1003, close: 1005 }, // breakout close > level
  { time: 2, open: 1002, high: 1003, low: 1000.2, close: 1001 }, // retest touches band, holds above
]
// same breakout, but the pullback closes back below the level → failed retest.
const fails: Candle[] = [
  holds[0]!, holds[1]!,
  { time: 2, open: 1001, high: 1002, low: 996, close: 997 },
]

describe('retest', () => {
  it('passes when price returns to the level and holds it as support (long)', () => {
    const r = retest(holds, level, 'long', defaultConfig)
    expect(r.id).toBe('retest')
    expect(r.status).toBe('pass')
  })
  it('fails when the pullback closes back through the level', () => {
    expect(retest(fails, level, 'long', defaultConfig).status).toBe('fail')
  })
  it('waits when no pullback to the level has happened yet', () => {
    expect(retest(holds.slice(0, 2), level, 'long', defaultConfig).status).toBe('wait')
  })
})
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/gates/retest.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Create `src/gates/retest.ts`:

```ts
import type { Candle, Config, Direction, GateResult } from '../types'

/**
 * Retest gate (checklist step 6). Requires, in order within the window:
 *   1. a breakout bar that CLOSED beyond `level` in `direction`, then
 *   2. a later bar that returned to within `retestBand` of the level and HELD it
 *      (long: low reached the band, close stayed ≥ level → old resistance now support;
 *       short: high reached the band, close stayed ≤ level → old support now resistance).
 * A return that CLOSED back through the level is a `fail` (failed retest). No return yet → `wait`.
 * retestBand is a fraction of price (config.tolerances.retestBand).
 */
export function retest(candles: Candle[], level: number, direction: Direction, config: Config): GateResult {
  const id = 'retest'
  const band = level * config.tolerances.retestBand

  const brokeAt = candles.findIndex((c) => (direction === 'long' ? c.close > level : c.close < level))
  if (brokeAt === -1) return { id, status: 'wait', detail: 'No breakout close beyond the level in the window yet.' }

  for (let i = brokeAt + 1; i < candles.length; i++) {
    const c = candles[i]!
    if (direction === 'long') {
      const touched = c.low <= level + band
      if (!touched) continue
      return c.close >= level
        ? { id, status: 'pass', detail: `Retest at bar ${i}: low ${c.low} touched band, close ${c.close} held ≥ level ${level}.` }
        : { id, status: 'fail', detail: `Failed retest at bar ${i}: close ${c.close} fell back below level ${level}.` }
    } else {
      const touched = c.high >= level - band
      if (!touched) continue
      return c.close <= level
        ? { id, status: 'pass', detail: `Retest at bar ${i}: high ${c.high} touched band, close ${c.close} held ≤ level ${level}.` }
        : { id, status: 'fail', detail: `Failed retest at bar ${i}: close ${c.close} rose back above level ${level}.` }
    }
  }
  return { id, status: 'wait', detail: 'Breakout occurred but price has not returned to the level yet.' }
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run src/gates/retest.test.ts` → PASS.
- [ ] **Step 5: `quant-reviewer` + `architect` gate**, then commit:

```bash
git add src/gates/retest.ts src/gates/retest.test.ts
git commit -m "feat: add retest gate (holds broken level as new S/R)"
```

---

## Task 2.4: Confirmation gate (`confirmation`)

A continuation candle in the breakout direction after the retest — not a mere touch.

**Files:**
- Create: `src/gates/confirmation.ts`
- Test: `src/gates/confirmation.test.ts`

**Interfaces:**
- Consumes: `Candle`, `Direction`, `GateResult`.
- Produces: `confirmation(candles: Candle[], direction: Direction): GateResult` — `id: 'confirmation'`. `pass` when the last candle is a directional continuation (long: bullish body — close > open — closing in the upper half of its range; short mirrored); `wait` otherwise.

- [ ] **Step 1: Write the failing test.** Create `src/gates/confirmation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { confirmation } from './confirmation'
import type { Candle } from '../types'

const bullish: Candle[] = [{ time: 0, open: 1000, high: 1006, low: 999, close: 1005 }]
const doji: Candle[] = [{ time: 0, open: 1000, high: 1006, low: 994, close: 1000.1 }]

describe('confirmation', () => {
  it('passes on a strong bullish continuation candle for a long', () => {
    const r = confirmation(bullish, 'long')
    expect(r.id).toBe('confirmation')
    expect(r.status).toBe('pass')
  })
  it('waits on an indecisive candle', () => {
    expect(confirmation(doji, 'long').status).toBe('wait')
  })
})
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/gates/confirmation.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Create `src/gates/confirmation.ts`:

```ts
import type { Candle, Direction, GateResult } from '../types'

/**
 * Confirmation candle (checklist step 7): a genuine continuation in the breakout
 * direction, not a mere touch. Long = bullish body (close > open) closing in the upper
 * third of its high-low range; short = bearish body closing in the lower third. The
 * range-position test rejects long upper/lower wicks (indecision) that a body-only test
 * would pass.
 */
export function confirmation(candles: Candle[], direction: Direction): GateResult {
  const id = 'confirmation'
  const c = candles[candles.length - 1]
  if (!c) return { id, status: 'wait', detail: 'No candle to confirm.' }

  const range = c.high - c.low
  if (range <= 0) return { id, status: 'wait', detail: 'Zero-range candle; no confirmation.' }
  const pos = (c.close - c.low) / range // 1 = closed at the high, 0 = at the low

  if (direction === 'long') {
    if (c.close > c.open && pos >= 2 / 3) return { id, status: 'pass', detail: `Bullish continuation: close ${c.close} > open ${c.open}, closed in upper third (${pos.toFixed(2)}).` }
    return { id, status: 'wait', detail: `No bullish confirmation (close>open=${c.close > c.open}, pos=${pos.toFixed(2)}).` }
  }
  if (c.close < c.open && pos <= 1 / 3) return { id, status: 'pass', detail: `Bearish continuation: close ${c.close} < open ${c.open}, closed in lower third (${pos.toFixed(2)}).` }
  return { id, status: 'wait', detail: `No bearish confirmation (close<open=${c.close < c.open}, pos=${pos.toFixed(2)}).` }
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run src/gates/confirmation.test.ts` → PASS.
- [ ] **Step 5: `quant-reviewer` + `architect` gate**, then commit:

```bash
git add src/gates/confirmation.ts src/gates/confirmation.test.ts
git commit -m "feat: add confirmation-candle gate"
```

---

## Task R2: Retrofit `riskReward` to be direction-aware

**Files:**
- Modify: `src/gates/riskReward.ts`
- Test: `src/gates/riskReward.test.ts` (extend)

**Interfaces:**
- Produces (new signature): `riskReward(entry: number, sl: number, tp: number, direction: Direction, config: Config): GateResult` — `id: 'risk-reward'`. Long: risk = entry−sl, reward = tp−entry. Short: risk = sl−entry, reward = entry−tp. `pass` iff reward/risk ≥ `minRR` and both > 0.

- [ ] **Step 1: Extend the test** in `src/gates/riskReward.test.ts`:

```ts
import type { Direction } from '../types'

it('short: passes when the downside reward clears minRR', () => {
  // entry 1000, sl 1002 (risk 2), tp 995 (reward 5) → 2.5 ≥ 1.5
  const r = riskReward(1000, 1002, 995, 'short' as Direction, defaultConfig)
  expect(r.status).toBe('pass')
})
it('short: fails a wrong-side stop (sl below entry)', () => {
  expect(riskReward(1000, 998, 995, 'short' as Direction, defaultConfig).status).toBe('fail')
})
```

Update existing long tests to pass `'long'` as the fourth argument.

- [ ] **Step 2: Run → fail.** `npx vitest run src/gates/riskReward.test.ts` → FAIL (arity).

- [ ] **Step 3: Reimplement `src/gates/riskReward.ts`:**

```ts
import type { Config, Direction, GateResult } from '../types'

/**
 * Risk:Reward gate (checklist step 11). Direction-aware:
 *   long  → risk = entry − sl, reward = tp − entry
 *   short → risk = sl − entry, reward = entry − tp
 * Passes iff reward/risk ≥ config.minRR with both distances > 0. Degenerate inputs
 * (wrong-side stop/target) → `fail`, never a divide-by-zero or false pass.
 */
export function riskReward(entry: number, sl: number, tp: number, direction: Direction, config: Config): GateResult {
  const id = 'risk-reward'
  const risk = direction === 'long' ? entry - sl : sl - entry
  const reward = direction === 'long' ? tp - entry : entry - tp
  const minRR = config.minRR

  if (risk <= 0) return { id, status: 'fail', detail: `Invalid risk ${risk} ≤ 0 for a ${direction} setup (sl on the wrong side of entry).` }
  if (reward <= 0) return { id, status: 'fail', detail: `Invalid reward ${reward} ≤ 0 for a ${direction} setup (tp on the wrong side of entry).` }

  const rr = reward / risk
  return rr >= minRR
    ? { id, status: 'pass', detail: `R:R ${rr.toFixed(2)} (reward ${reward} / risk ${risk}) ≥ ${minRR}.` }
    : { id, status: 'fail', detail: `R:R ${rr.toFixed(2)} (reward ${reward} / risk ${risk}) < ${minRR}.` }
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run src/gates/riskReward.test.ts` → PASS.
- [ ] **Step 5: `quant-reviewer` + `architect` gate**, then commit:

```bash
git add src/gates/riskReward.ts src/gates/riskReward.test.ts
git commit -m "refactor: make R:R gate direction-aware"
```

---

## Task R3: Retrofit `risk.ts` — direction-aware TP + non-finite guard

**Files:**
- Modify: `src/scoring/risk.ts`
- Test: `src/scoring/risk.test.ts` (extend)

**Interfaces:**
- Produces:
  - `positionSize(accountSize, riskPct, slDistance, contractSize): number` — unchanged signature; **now hard-fails to `0` on any non-finite input** (open quant-reviewer flag).
  - `takeProfits(entry: number, slDistance: number, direction: Direction, nextSR?: number): { tp1: number; tp2: number }` — projects TPs in `direction`; caps by `nextSR` on the correct side.

- [ ] **Step 1: Extend the test** in `src/scoring/risk.test.ts`:

```ts
import type { Direction } from '../types'

it('positionSize hard-fails to 0 on non-finite inputs', () => {
  expect(positionSize(NaN, 0.01, 2, 100)).toBe(0)
  expect(positionSize(200, 0.01, Infinity, 100)).toBe(0)
})

it('takeProfits projects downward for a short', () => {
  const { tp1, tp2 } = takeProfits(1000, 2, 'short' as Direction)
  expect(tp1).toBe(998) // entry − 1R
  expect(tp2).toBe(996) // entry − 2R
})

it('takeProfits caps a short target at nextSR support', () => {
  const { tp2 } = takeProfits(1000, 2, 'short' as Direction, 997) // support at 997 is nearer than 996
  expect(tp2).toBe(997)
})
```

Update existing long `takeProfits` tests to pass `'long'` as the third argument.

- [ ] **Step 2: Run → fail.** `npx vitest run src/scoring/risk.test.ts` → FAIL.

- [ ] **Step 3: Reimplement `src/scoring/risk.ts`:**

```ts
import type { Direction } from '../types'

/**
 * Lot size for a fixed-fractional risk model:
 *   lot = (accountSize * riskPct) / (slDistance * contractSize)
 * Guards non-positive AND non-finite inputs → returns 0 (never NaN/Infinity/negative lot).
 */
export function positionSize(accountSize: number, riskPct: number, slDistance: number, contractSize: number): number {
  const inputs = [accountSize, riskPct, slDistance, contractSize]
  if (inputs.some((n) => !Number.isFinite(n))) return 0
  if (slDistance <= 0 || contractSize <= 0) return 0
  return (accountSize * riskPct) / (slDistance * contractSize)
}

/**
 * Take-profit targets, direction-aware:
 *   long  → tp1 = entry + 1R, tp2 = entry + 2R (R = slDistance)
 *   short → tp1 = entry − 1R, tp2 = entry − 2R
 * Structure overrides math: if `nextSR` is nearer than a computed target, cap to it
 * (long: nextSR below target; short: nextSR above target).
 */
export function takeProfits(entry: number, slDistance: number, direction: Direction, nextSR?: number): { tp1: number; tp2: number } {
  const sign = direction === 'long' ? 1 : -1
  let tp1 = entry + sign * 1.0 * slDistance
  let tp2 = entry + sign * 2.0 * slDistance

  if (nextSR !== undefined) {
    if (direction === 'long') {
      if (nextSR < tp1) tp1 = nextSR
      if (nextSR < tp2) tp2 = nextSR
    } else {
      if (nextSR > tp1) tp1 = nextSR
      if (nextSR > tp2) tp2 = nextSR
    }
  }
  return { tp1, tp2 }
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run src/scoring/risk.test.ts` → PASS.
- [ ] **Step 5: `quant-reviewer` + `architect` gate**, then commit:

```bash
git add src/scoring/risk.ts src/scoring/risk.test.ts
git commit -m "refactor: direction-aware take-profits + non-finite positionSize guard"
```

---

## Task 2.6: Wire-in — `evaluateSetup` + `score.authorized` + App integration

Assembles the required-gate sequence, demotes the score to a readout, and consumes it in `App.tsx` so the checklist rows, score meter, and trade card fill with a real candidate setup.

**Files:**
- Create: `src/scoring/evaluateSetup.ts`
- Modify: `src/scoring/score.ts`
- Test: `src/scoring/evaluateSetup.test.ts`, `src/scoring/score.test.ts` (extend)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `bias` (T2.5), `structure` (T2.1), `consolidation` (T2.2), `levelId` (T2.0), `breakoutClose` (R1), `retest` (T2.3), `confirmation` (T2.4), `riskReward` (R2), `takeProfits`/`positionSize` (R3), `vetoes` (existing), `score` (modified); `MarketContext`, `Config`, `GateResult`, `Direction`.
- Produces:
  - `score(gateResults, vetoes?): { passed: number; band: ScoreBand; authorized: boolean }` — `authorized` is `false` unless the caller passes an already-authorized set (see below); band logic unchanged.
  - `evaluateSetup(ctx, config): SetupVerdict` where (authoritative definition — matches Step 5):
    ```ts
    export type SetupVerdict =
      | { status: 'wait'; blockedBy: string; direction: Direction | null; gates: GateResult[]; vetoes: GateResult[]; score: Score }
      | { status: 'setup'; direction: Direction; level: number; entry: number; sl: number; tp1: number; tp2: number; lot: number; gates: GateResult[]; vetoes: GateResult[]; score: Score }
    ```

- [ ] **Step 1: Extend `score.ts` with `authorized`.** In `src/scoring/score.ts`, change the `Score` type and function:

```ts
export type Score = { passed: number; band: ScoreBand; authorized: boolean }

export function score(gateResults: GateResult[], vetoes: GateResult[] = [], authorized = false): Score {
  const passed = gateResults.filter((g) => g.status === 'pass').length
  let band: ScoreBand
  if (passed <= WAIT_MAX) band = 'wait'
  else if (passed >= STRONG_MIN) band = 'strong'
  else band = 'building'
  const vetoed = vetoes.some((v) => v.status === 'fail')
  if (vetoed) band = 'wait'
  return { passed, band, authorized: authorized && !vetoed }
}
```

Update `src/scoring/score.test.ts`: existing assertions add `authorized: false` (or assert the field explicitly); add one case asserting `score(gates, [], true).authorized === true` and that a firing veto forces `authorized === false`.

- [ ] **Step 2: Run score tests → pass.** `npx vitest run src/scoring/score.test.ts` → PASS.

- [ ] **Step 3: Write the failing `evaluateSetup` test.** Create `src/scoring/evaluateSetup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evaluateSetup } from './evaluateSetup'
import { defaultConfig } from '../config'
import { rangeSeries, trendSeries } from '../../tests/fixtures/structureSeries'
import type { MarketContext } from '../types'

const ctxAll = (c: MarketContext['m5']): MarketContext => ({ m5: c, m15: c, h1: c })

describe('evaluateSetup', () => {
  it('waits and names the first failing gate when H1 bias is unclear', () => {
    const v = evaluateSetup(ctxAll(rangeSeries()), defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') expect(v.blockedBy).toBe('h1-m15-bias')
  })

  it('short-circuits: a clear bias but no breakout still waits, not setup', () => {
    const v = evaluateSetup(ctxAll(trendSeries('up', 6)), defaultConfig)
    expect(v.status).toBe('wait') // later gates (breakout/retest/confirmation) not satisfied by a bare trend
    expect(v.gates.some((g) => g.id === 'h1-m15-bias' && g.status === 'pass')).toBe(true)
  })

  it('always reports one GateResult per checklist row, in order', () => {
    const v = evaluateSetup(ctxAll(trendSeries('up', 6)), defaultConfig)
    expect(v.gates.map((g) => g.id)).toEqual([
      'h1-m15-bias', 'market-structure', 'consolidation', 'level-id',
      'breakout-close', 'retest', 'confirmation', 'risk-reward',
    ])
  })
})
```

- [ ] **Step 4: Run → fail.** `npx vitest run src/scoring/evaluateSetup.test.ts` → FAIL.

- [ ] **Step 5: Implement `src/scoring/evaluateSetup.ts`:**

```ts
import type { Config, Direction, GateResult, MarketContext } from '../types'
import { bias } from '../gates/bias'
import { structure } from '../gates/structure'
import { consolidation } from '../gates/consolidation'
import { levelId } from '../gates/levelId'
import { breakoutClose } from '../gates/breakoutClose'
import { retest } from '../gates/retest'
import { confirmation } from '../gates/confirmation'
import { riskReward } from '../gates/riskReward'
import { positionSize, takeProfits } from './risk'
import { vetoes } from './vetoes'
import { score, type Score } from './score'

export type SetupVerdict =
  | { status: 'wait'; blockedBy: string; direction: Direction | null; gates: GateResult[]; vetoes: GateResult[]; score: Score }
  | { status: 'setup'; direction: Direction; level: number; entry: number; sl: number; tp1: number; tp2: number; lot: number; gates: GateResult[]; vetoes: GateResult[]; score: Score }

const WAIT = (id: string): GateResult => ({ id, status: 'wait', detail: 'Not evaluated — an earlier required gate did not pass.' })
const ORDER = ['h1-m15-bias', 'market-structure', 'consolidation', 'level-id', 'breakout-close', 'retest', 'confirmation', 'risk-reward'] as const

/**
 * Required-gate sequence (checklist steps 1→9 & 14). Runs the gates in order and
 * short-circuits to WAIT on the first that is not `pass`, naming it in `blockedBy`.
 * The score/band is DISPLAY-ONLY — `authorized` is driven by this sequence, never the tally.
 * Any firing veto forces WAIT regardless of the sequence.
 */
export function evaluateSetup(ctx: MarketContext, config: Config): SetupVerdict {
  const vetoResults = vetoes(ctx, config)
  const results = new Map<string, GateResult>()
  const finish = (blockedBy: string, direction: Direction | null): SetupVerdict => {
    const gates = ORDER.map((id) => results.get(id) ?? WAIT(id))
    return { status: 'wait', blockedBy, direction, gates, vetoes: vetoResults, score: score(gates, vetoResults, false) }
  }

  // 1. Bias → direction
  const b = bias(ctx, config)
  results.set('h1-m15-bias', b.result)
  if (b.result.status !== 'pass' || b.direction === null) return finish('h1-m15-bias', b.direction)
  const direction = b.direction

  // 2. Structure
  const s = structure(ctx.h1, direction)
  results.set('market-structure', s)
  if (s.status !== 'pass') return finish('market-structure', direction)

  // 3. Consolidation (fail = NO-TRADE; only `pass` proceeds)
  const con = consolidation(ctx.m5, config)
  results.set('consolidation', con)
  if (con.status !== 'pass') return finish('consolidation', direction)

  // 4. Level-ID
  const lvl = levelId(ctx.m5, direction)
  results.set('level-id', lvl.result)
  if (lvl.result.status !== 'pass' || lvl.level === null) return finish('level-id', direction)
  const level = lvl.level

  // 5. Breakout close
  const brk = breakoutClose(ctx.m5, level, direction, config)
  results.set('breakout-close', brk)
  if (brk.status !== 'pass') return finish('breakout-close', direction)

  // 6. Retest
  const rt = retest(ctx.m5, level, direction, config)
  results.set('retest', rt)
  if (rt.status !== 'pass') return finish('retest', direction)

  // 7. Confirmation
  const cf = confirmation(ctx.m5, direction)
  results.set('confirmation', cf)
  if (cf.status !== 'pass') return finish('confirmation', direction)

  // 8. Risk:reward — entry = last close; SL = the broken level (structural); TP from R multiples.
  const last = ctx.m5[ctx.m5.length - 1]!
  const entry = last.close
  const sl = level
  const slDistance = Math.abs(entry - sl)
  const { tp1, tp2 } = takeProfits(entry, slDistance, direction)
  const rr = riskReward(entry, sl, tp2, direction, config)
  results.set('risk-reward', rr)
  if (rr.status !== 'pass') return finish('risk-reward', direction)

  const gates = ORDER.map((id) => results.get(id)!)
  const vetoed = vetoResults.some((v) => v.status === 'fail')
  if (vetoed) return finish('veto', direction)

  const lot = positionSize(config.accountSize, config.riskPct, slDistance, config.contractSize)
  return { status: 'setup', direction, level, entry, sl, tp1, tp2, lot, gates, vetoes: vetoResults, score: score(gates, vetoResults, true) }
}
```

- [ ] **Step 6: Run → pass.** `npx vitest run src/scoring/evaluateSetup.test.ts` → PASS. Adjust the `trendSeries` fixture only if bias/structure do not pass on it — never weaken a gate to make the test green.

> **Open seam — 10 checklist rows vs 8 required gates.** The Phase-1 checklist (`src/ui/labels.ts::PHASE1_GATES`) lists 10 rows including `ema9` ("Price above rising EMA9") and `stochastic` ("Stochastic turning up"). The verbatim 13-step strategy treats neither as a standalone required gate: EMA9 is folded into `bias`/`consolidation` (step 8 — "supports, does not override"), and **stochastic is not in the doc at all** (a leftover from the earlier MVP indicator set). Resolution for this plan: the checklist renders the **8 required-gate rows** from `verdictModel.gates`; EMA9 and the stochastic stay visible where they already live — the `PriceChart` panel — as supporting indicators, not checklist gates. In `src/ui/labels.ts`, trim `PHASE1_GATES` to the 8 required ids (drop `ema9`, `stochastic`); update `src/ui/Checklist.test.tsx` row-count assertions accordingly. This keeps the UI honest: every checklist row maps 1:1 to a required gate the engine actually evaluates.

- [ ] **Step 7: Wire `App.tsx` to `evaluateSetup`.** Replace the `phase1Gates()` placeholder and the score/verdict/trade-card block in `src/App.tsx`, and trim `PHASE1_GATES` to the 8 required ids per the open-seam note above:

```tsx
import { evaluateSetup } from './scoring/evaluateSetup'
// ...remove: phase1Gates, PHASE1_GATES import if now unused for row generation, the manual `vetoes`/`score` calls.

const verdictModel = evaluateSetup(ctx, config)
const gates = verdictModel.gates
const vetoResults = verdictModel.vetoes
const signal = verdictModel.score
const verdict =
  verdictModel.status === 'setup'
    ? `${verdictModel.direction.toUpperCase()} setup authorized — all required gates passed. Entry ${verdictModel.entry}, SL ${verdictModel.sl}.`
    : `Holding — first unmet gate: ${verdictModel.blockedBy}. Bias toward WAIT.`

const tradeSetup =
  verdictModel.status === 'setup'
    ? { entry: verdictModel.entry, sl: verdictModel.sl, tp1: verdictModel.tp1, tp2: verdictModel.tp2, lot: verdictModel.lot, direction: verdictModel.direction }
    : null
// pass tradeSetup to <TradeCard setup={tradeSetup} /> (extend TradeCard props to accept this shape if it currently only accepts null).
```

Update the "Phase 1 of 2" banner copy to reflect that live signal assembly is now active.

- [ ] **Step 8: Verify the whole suite + typecheck + build.**

```bash
npm run typecheck            # expect: pass
npx vitest run               # expect: all green (Phase 1 + Phase 2)
npm run build                # expect: build succeeds
```

- [ ] **Step 9: `verify` skill — drive the UI.** Run the dev server, load the dashboard, confirm the checklist rows now reflect real per-gate status (not ten identical WAITs), the score meter tracks, and the trade card fills only when `status: 'setup'`. Confirm **no BUY button** exists.

- [ ] **Step 10: `quant-reviewer` (sequence fidelity to checklist steps 1→9,14) + `architect` (import direction, types) gate**, then commit:

```bash
git add src/scoring/evaluateSetup.ts src/scoring/evaluateSetup.test.ts src/scoring/score.ts src/scoring/score.test.ts src/App.tsx
git commit -m "feat: wire heuristic gates into a hard required-gate sequence + live UI"
```

- [ ] **Step 11: Phase 2 boundary — checkpoint + STOP for Luis.** Run the `northmark-checkpoint` skill (Checkpoint mode): mark Tasks 2.0–2.6 done, advance the Current block, log any Tier-2 calls, commit. Surface the decision log and any open flags; do NOT roll into Phase 3.

---

## Self-Review

**Spec coverage:** every spec section maps to a task — decision spine → T2.6 (`evaluateSetup`); Direction type → T2.0T; gates 2.0–2.5 → Tasks 2.0/2.1/2.2/2.3/2.4/2.5; retrofits (breakout/riskReward/risk) → R1/R2/R3; score demotion → T2.6 Step 1; structure-driven thresholds → T2.2 + config reframe (T2.0T); App wire-in → T2.6 Steps 7–9. Known-gap items ("This is critical:" continuation, threshold calibration) are documented, not coded — correctly out of scope.

**Placeholder scan:** no "TBD"/"handle edge cases"/"similar to Task N" — every code step shows complete code; every test shows real, construct-by-design values (no fabricated indicator decimals). Fixtures where a gate's exact threshold interacts with detector internals carry an explicit "adjust the fixture, never the gate" instruction rather than a hidden magic number.

**Type consistency:** `Direction` defined once (T2.0T), consumed by identical signature everywhere. Gate ids match `labels.ts::PHASE1_GATES` exactly (`h1-m15-bias`, `market-structure`, `consolidation`, `level-id`, `breakout-close`, `retest`, `confirmation`, `risk-reward`). `Score` gains `authorized` in T2.6 Step 1 before `evaluateSetup` consumes it (Step 5). `structureDirection`/`structure` (T2.1) are consumed by `bias` (T2.5) and `evaluateSetup` (T2.6) under those exact names. `takeProfits`/`positionSize`/`riskReward`/`breakoutClose` new signatures (direction arg) are defined in R1/R2/R3 before T2.6 calls them.

**Ordering:** T2.0T → T2.1 → T2.5 → T2.0 → T2.2 → R1 → T2.3 → T2.4 → R2 → R3 → T2.6 respects every consumes/produces edge (classifier before bias; all gates + retrofits before the wire-in). The required sequence covers checklist steps 1→9 & 14 explicitly. The 10-row-vs-8-gate seam is resolved in T2.6 Step 7 (trim the checklist to the 8 required rows; EMA9/stochastic remain supporting indicators in the chart panel), so every remaining checklist row maps 1:1 to a gate the engine evaluates.
