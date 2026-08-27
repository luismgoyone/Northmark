# Dual-Engine Bake-off — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the automated "Claude" strategy engine (computable-only, two-stage veto→weighted→A–F grade) and surface it beside the existing "Dad + ChatGPT" engine in the **Signal** and **Checklist** tabs, so the two strategies' live verdicts can be compared on the same candle.

**Architecture:** New pure functions under `src/indicators/atr.ts` and `src/edge/*` compose the existing `evaluateSetup` structural pipeline, then layer Claude's own session-timing veto, news-blackout veto, and weighted grading on top (`scoring/evaluateSetupClaude.ts`). The UI gains a `StrategySection` wrapper and small Claude-side components, wired into the existing tabbed `App.tsx`. No sim/server/paper changes in Phase 1 (that is Phase 2); no real news feed yet (Phase 3) — Phase 1 passes an empty events array.

**Tech Stack:** TypeScript (strict, NodeNext ESM — imports end in `.js`), React 18, Vite, Tailwind, Vitest.

## Global Constraints

- Instrument/timeframe: XAUUSD M5. Read-only / paper only — never place orders.
- Import direction is one-way downward: `indicators → gates → scoring/edge → ui`. `edge` may import `indicators`, `gates`, `scoring`, `types`; UI imports down only. No upward imports.
- Pure engine modules: no I/O, no clock, no randomness. `Date.now()`, `Math.random()`, and arg-less `new Date()` are forbidden; a timestamp is always **passed in** (`now: number`). `new Date(ts)` with an explicit `ts` is allowed (used only inside `edge/session.ts` via `Intl`).
- All new `.ts` engine modules are built test-first (TDD): failing test → run → minimal impl → run → commit.
- Session logic MUST be DST-aware — derive London/New-York local time via `Intl` with `Europe/London` / `America/New_York`, never hard-coded UTC offsets.
- No invented win-rate percentages in code or copy. Folklore-grade criteria are labeled as such.
- Section weights are fixed and MUST sum to 100: Bias 22 · Structure 28 · Confluence 17 · Timing 16 · Risk 17.
- Grade thresholds: A ≥ 90 · B ≥ 78 · C ≥ 65 · D ≥ 50 · F < 50 (or any veto). Structure-floor rule: if the Structure section earns < 60% of its weight, cap the grade at C. Confluence count is capped at 3. Engine marks a setup `tradeable` only at grade A or B.
- Existing files for reference: `src/scoring/evaluateSetup.ts` (structural pipeline + `SetupVerdict`), `src/config.ts` (`defaultConfig`), `src/indicators/{ema,stochastic,swingPoints}.ts`, `src/App.tsx` (tabbed shell), `src/ui/{TradeCard,VetoList,Score,Checklist}.tsx`.

---

### Task 1: ATR indicator

**Files:**
- Create: `src/indicators/atr.ts`
- Test: `src/indicators/atr.test.ts`

**Interfaces:**
- Consumes: `Candle` from `../types.js`.
- Produces: `atr(candles: Candle[], period: number): number` — mean True Range over the last `period` bars.

- [ ] **Step 1: Write the failing test**

```ts
// src/indicators/atr.test.ts
import { describe, expect, it } from 'vitest'
import { atr } from './atr'
import type { Candle } from '../types'

const c = (high: number, low: number, close: number): Candle => ({ time: 0, open: close, high, low, close })

describe('atr', () => {
  it('averages True Range over the period', () => {
    // TR for bars 2..4 (prevClose given): each constructed to TR = 10.
    const candles: Candle[] = [
      c(100, 90, 95), // seed prevClose = 95
      c(105, 95, 100), // TR = max(10, |105-95|, |95-95|) = 10
      c(110, 100, 105), // TR = max(10, |110-100|, |100-100|) = 10
      c(115, 105, 110), // TR = 10
    ]
    expect(atr(candles, 3)).toBe(10)
  })

  it('captures gap-driven True Range beyond the bar range', () => {
    const candles: Candle[] = [c(10, 8, 9), c(30, 28, 29)] // TR = max(2, |30-9|, |28-9|) = 21
    expect(atr(candles, 1)).toBe(21)
  })

  it('throws when there are too few candles', () => {
    expect(() => atr([c(1, 0, 0.5)], 3)).toThrow(/at least/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/indicators/atr.test.ts`
Expected: FAIL — `atr` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/indicators/atr.ts
import type { Candle } from '../types.js'

/** True Range of `curr` given the previous candle's close. */
function trueRange(curr: Candle, prevClose: number): number {
  return Math.max(curr.high - curr.low, Math.abs(curr.high - prevClose), Math.abs(curr.low - prevClose))
}

/**
 * Average True Range over the last `period` bars (simple mean of True Range).
 * Needs at least `period + 1` candles (the first TR needs a previous close). Pure.
 */
export function atr(candles: Candle[], period: number): number {
  if (period < 1) throw new Error(`atr: period must be >= 1, got ${period}`)
  if (candles.length < period + 1) {
    throw new Error(`atr: need at least ${period + 1} candles, got ${candles.length}`)
  }
  let sum = 0
  for (let i = candles.length - period; i < candles.length; i++) {
    sum += trueRange(candles[i]!, candles[i - 1]!.close)
  }
  return sum / period
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/indicators/atr.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/indicators/atr.ts src/indicators/atr.test.ts
git commit -m "feat(indicators): ATR (mean True Range)"
```

---

### Task 2: DST-aware session classifier

**Files:**
- Create: `src/edge/session.ts`
- Test: `src/edge/session.test.ts`

**Interfaces:**
- Produces:
  - `type SessionQuality = 'prime' | 'good' | 'selective' | 'low' | 'avoid'`
  - `type SessionWindow = { window: string; quality: SessionQuality }`
  - `classifySession(now: number): SessionWindow`
  - `isFridayLate(now: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/edge/session.test.ts
import { describe, expect, it } from 'vitest'
import { classifySession, isFridayLate } from './session'

// Instants chosen to exercise the London/NY windows AND the DST boundary.
const utc = (iso: string): number => new Date(iso).getTime()

describe('classifySession', () => {
  it('marks the London–NY overlap as prime (summer)', () => {
    // 2026-07-01 14:00Z → London 15:00 BST, NY 10:00 EDT → both active.
    expect(classifySession(utc('2026-07-01T14:00:00Z')).quality).toBe('prime')
  })

  it('is DST-aware: the same UTC instant differs winter vs summer', () => {
    // 12:30Z. Winter: London 12:30 GMT, NY 07:30 EST → NY not yet open → 'good'.
    expect(classifySession(utc('2026-01-15T12:30:00Z')).quality).toBe('good')
    // Summer: London 13:30 BST, NY 08:30 EDT → both active → 'prime'.
    expect(classifySession(utc('2026-07-01T12:30:00Z')).quality).toBe('prime')
  })

  it('marks the NY rollover hour as avoid', () => {
    // 2026-07-01 21:30Z → NY 17:30 EDT → rollover dead-zone.
    expect(classifySession(utc('2026-07-01T21:30:00Z')).quality).toBe('avoid')
  })

  it('marks the Asian/off-session as low', () => {
    // 2026-07-01 02:00Z → London 03:00, NY 22:00 → neither active.
    expect(classifySession(utc('2026-07-01T02:00:00Z')).quality).toBe('low')
  })
})

describe('isFridayLate', () => {
  it('is true late Friday NY time', () => {
    // 2026-07-03 is a Friday. 20:00Z → NY 16:00 EDT.
    expect(isFridayLate(utc('2026-07-03T20:00:00Z'))).toBe(true)
  })
  it('is false midweek', () => {
    expect(isFridayLate(utc('2026-07-01T20:00:00Z'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/edge/session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/edge/session.ts
export type SessionQuality = 'prime' | 'good' | 'selective' | 'low' | 'avoid'
export type SessionWindow = { window: string; quality: SessionQuality }

const LONDON = 'Europe/London'
const NEW_YORK = 'America/New_York'

/** Local wall-clock hour (decimal, e.g. 13.5) for `ts` in `timeZone`. DST-aware via Intl. */
function localHour(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ts))
  const hour = Number(parts.find((p) => p.type === 'hour')!.value) % 24
  const minute = Number(parts.find((p) => p.type === 'minute')!.value)
  return hour + minute / 60
}

/** Short weekday name ('Mon'..'Sun') for `ts` in `timeZone`. */
function weekday(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(ts))
}

/**
 * Classify a UTC instant into a gold-trading session window + expectancy quality.
 * London active 08:00–17:00 local; New York active 08:00–17:00 local. Both active =
 * the London–NY overlap (peak). The NY 17:00–18:00 rollover is a low-liquidity dead-zone.
 */
export function classifySession(now: number): SessionWindow {
  const lh = localHour(now, LONDON)
  const nh = localHour(now, NEW_YORK)
  const londonActive = lh >= 8 && lh < 17
  const nyActive = nh >= 8 && nh < 17

  if (nh >= 17 && nh < 18) return { window: 'NY rollover', quality: 'avoid' }
  if (londonActive && nyActive) return { window: 'London–NY overlap', quality: 'prime' }
  if (londonActive) return { window: 'London session', quality: 'good' }
  if (nyActive) return { window: 'NY afternoon', quality: 'selective' }
  return { window: 'Asian / off-session', quality: 'low' }
}

/** Friday from ~15:00 New York time onward — weekend-gap risk window. */
export function isFridayLate(now: number): boolean {
  return weekday(now, NEW_YORK) === 'Fri' && localHour(now, NEW_YORK) >= 15
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/edge/session.test.ts`
Expected: PASS (6 assertions across 2 describes).

- [ ] **Step 5: Commit**

```bash
git add src/edge/session.ts src/edge/session.test.ts
git commit -m "feat(edge): DST-aware gold session classifier"
```

---

### Task 3: News-blackout window (pure)

**Files:**
- Create: `src/edge/newsWindow.ts`
- Test: `src/edge/newsWindow.test.ts`

**Interfaces:**
- Produces:
  - `type NewsEvent = { time: number; impact: 'high' | 'medium' | 'low'; currency: string; title: string }`
  - `newsBlackout(events: NewsEvent[], now: number): NewsEvent | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/edge/newsWindow.test.ts
import { describe, expect, it } from 'vitest'
import { newsBlackout, type NewsEvent } from './newsWindow'

const now = 1_000_000_000_000
const ev = (offsetMin: number, over: Partial<NewsEvent> = {}): NewsEvent => ({
  time: now + offsetMin * 60_000,
  impact: 'high',
  currency: 'USD',
  title: 'CPI',
  ...over,
})

describe('newsBlackout', () => {
  it('blocks on a high-impact USD event within ±30 min', () => {
    expect(newsBlackout([ev(10)], now)?.title).toBe('CPI')
    expect(newsBlackout([ev(-25)], now)).not.toBeNull()
  })
  it('ignores events outside the window', () => {
    expect(newsBlackout([ev(45)], now)).toBeNull()
  })
  it('ignores non-high impact and irrelevant currencies', () => {
    expect(newsBlackout([ev(5, { impact: 'medium' })], now)).toBeNull()
    expect(newsBlackout([ev(5, { currency: 'EUR' })], now)).toBeNull()
  })
  it('treats XAU/GOLD/ALL as relevant', () => {
    expect(newsBlackout([ev(5, { currency: 'XAU' })], now)).not.toBeNull()
    expect(newsBlackout([ev(5, { currency: 'ALL' })], now)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/edge/newsWindow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/edge/newsWindow.ts
export type NewsEvent = { time: number; impact: 'high' | 'medium' | 'low'; currency: string; title: string }

const WINDOW_MS = 30 * 60_000
const RELEVANT = new Set(['USD', 'XAU', 'GOLD', 'ALL'])

/** The first high-impact USD/gold event within ±30 min of `now`, or null. Pure. */
export function newsBlackout(events: NewsEvent[], now: number): NewsEvent | null {
  for (const ev of events) {
    if (ev.impact !== 'high') continue
    if (!RELEVANT.has(ev.currency.toUpperCase())) continue
    if (Math.abs(ev.time - now) <= WINDOW_MS) return ev
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/edge/newsWindow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/edge/newsWindow.ts src/edge/newsWindow.test.ts
git commit -m "feat(edge): news-blackout window (pure)"
```

---

### Task 4: Expectancy math

**Files:**
- Create: `src/edge/expectancy.ts`
- Test: `src/edge/expectancy.test.ts`

**Interfaces:**
- Produces: `expectancyR(winRate: number, rr: number): number`, `breakevenWinRate(rr: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/edge/expectancy.test.ts
import { describe, expect, it } from 'vitest'
import { breakevenWinRate, expectancyR } from './expectancy'

describe('expectancy', () => {
  it('computes expectancy in R with a fixed 1R loss', () => {
    // (0.45 × 1.5) − (0.55 × 1) = 0.125
    expect(expectancyR(0.45, 1.5)).toBeCloseTo(0.125, 6)
  })
  it('computes the breakeven win rate for an R:R', () => {
    expect(breakevenWinRate(1.5)).toBeCloseTo(0.4, 6) // 1 / (1 + 1.5)
    expect(breakevenWinRate(1)).toBeCloseTo(0.5, 6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/edge/expectancy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/edge/expectancy.ts
/** Expectancy in R: E = win×rr − (1−win)×1, assuming a fixed 1R loss. */
export function expectancyR(winRate: number, rr: number): number {
  return winRate * rr - (1 - winRate) * 1
}

/** Win rate at which a given R:R breaks even: w* = 1 / (1 + rr). */
export function breakevenWinRate(rr: number): number {
  return 1 / (1 + rr)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/edge/expectancy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/edge/expectancy.ts src/edge/expectancy.test.ts
git commit -m "feat(edge): expectancy + breakeven win-rate math"
```

---

### Task 5: Two-stage weighted scorer (the crux)

**Files:**
- Create: `src/edge/scoreSetup.ts`
- Test: `src/edge/scoreSetup.test.ts`

**Interfaces:**
- Consumes: `SessionQuality` from `./session.js`.
- Produces:
  - `type Grade = 'A' | 'B' | 'C' | 'D' | 'F'`
  - `type Honesty = 'proven' | 'directional' | 'folklore'`
  - `type SectionKey = 'bias' | 'structure' | 'confluence' | 'timing' | 'risk'`
  - `type ScoreItem = { label: string; earned: number; weight: number; honesty: Honesty }`
  - `type SectionScore = { key: SectionKey; label: string; earned: number; weight: number; items: ScoreItem[] }`
  - `type EdgeScore = { total: number; grade: Grade; sections: SectionScore[]; structureFloorApplied: boolean }`
  - `type EdgeInputs = { biasStructureAgrees; priceCorrectSideEma; noOpposingLevelWithinAtr; retestHeld; entryNotExtended; stochNotExhausted; atrHealthy: boolean; confluenceCount: number; sessionQuality: SessionQuality; rr: number; targetBeforeOpposing: boolean }`
  - `scoreSetup(inp: EdgeInputs): EdgeScore`

- [ ] **Step 1: Write the failing test**

```ts
// src/edge/scoreSetup.test.ts
import { describe, expect, it } from 'vitest'
import { scoreSetup, type EdgeInputs } from './scoreSetup'

const perfect: EdgeInputs = {
  biasStructureAgrees: true,
  priceCorrectSideEma: true,
  noOpposingLevelWithinAtr: true,
  retestHeld: true,
  entryNotExtended: true,
  stochNotExhausted: true,
  atrHealthy: true,
  confluenceCount: 3,
  sessionQuality: 'prime',
  rr: 3,
  targetBeforeOpposing: true,
}

describe('scoreSetup', () => {
  it('scores a perfect setup at 100 → grade A', () => {
    const s = scoreSetup(perfect)
    expect(s.total).toBe(100)
    expect(s.grade).toBe('A')
    expect(s.sections.reduce((a, x) => a + x.weight, 0)).toBe(100) // weights sum to 100
  })

  it('caps the grade at C when structure is weak (structure floor)', () => {
    // Extended entry drops Structure to 16/28 (< 16.8 floor) while the rest stays strong.
    const s = scoreSetup({ ...perfect, entryNotExtended: false })
    expect(s.structureFloorApplied).toBe(true)
    expect(s.grade).toBe('C')
  })

  it('caps confluence count at 3', () => {
    const capped = scoreSetup({ ...perfect, confluenceCount: 9 })
    expect(capped.total).toBe(100) // no more than 3×2 = 6 confluence points
  })

  it('awards zero timing points for an avoid/low session', () => {
    const s = scoreSetup({ ...perfect, sessionQuality: 'low' })
    expect(s.total).toBe(100 - 16)
    expect(s.grade).toBe('B') // 84
  })

  it('returns F below 50', () => {
    const weak: EdgeInputs = {
      ...perfect,
      biasStructureAgrees: false,
      priceCorrectSideEma: false,
      noOpposingLevelWithinAtr: false,
      entryNotExtended: false,
      stochNotExhausted: false,
      atrHealthy: false,
      confluenceCount: 0,
      sessionQuality: 'low',
      rr: 1.5,
      targetBeforeOpposing: false,
    }
    expect(scoreSetup(weak).grade).toBe('F')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/edge/scoreSetup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/edge/scoreSetup.ts
import type { SessionQuality } from './session.js'

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'
export type Honesty = 'proven' | 'directional' | 'folklore'
export type SectionKey = 'bias' | 'structure' | 'confluence' | 'timing' | 'risk'
export type ScoreItem = { label: string; earned: number; weight: number; honesty: Honesty }
export type SectionScore = { key: SectionKey; label: string; earned: number; weight: number; items: ScoreItem[] }
export type EdgeScore = { total: number; grade: Grade; sections: SectionScore[]; structureFloorApplied: boolean }

export type EdgeInputs = {
  biasStructureAgrees: boolean
  priceCorrectSideEma: boolean
  noOpposingLevelWithinAtr: boolean
  retestHeld: boolean
  entryNotExtended: boolean
  stochNotExhausted: boolean
  atrHealthy: boolean
  confluenceCount: number
  sessionQuality: SessionQuality
  rr: number
  targetBeforeOpposing: boolean
}

const TIMING_POINTS: Record<SessionQuality, number> = { prime: 16, good: 12, selective: 5, low: 0, avoid: 0 }

/** R:R points: 1.5 floor is already required elsewhere; scale 1.5→3.0 across 0→11 points. */
function rrPoints(rr: number): number {
  const t = (Math.min(Math.max(rr, 1.5), 3) - 1.5) / (3 - 1.5)
  return Math.round(t * 11)
}

function gradeFor(total: number): Grade {
  if (total >= 90) return 'A'
  if (total >= 78) return 'B'
  if (total >= 65) return 'C'
  if (total >= 50) return 'D'
  return 'F'
}

const pt = (label: string, on: boolean, weight: number, honesty: Honesty): ScoreItem => ({
  label,
  earned: on ? weight : 0,
  weight,
  honesty,
})

export function scoreSetup(inp: EdgeInputs): EdgeScore {
  const confluenceCount = Math.min(inp.confluenceCount, 3)

  const sections: SectionScore[] = [
    {
      key: 'bias',
      label: 'Bias & Context',
      weight: 22,
      earned: 0,
      items: [
        pt('M15/H1 structure agrees', inp.biasStructureAgrees, 10, 'proven'),
        pt('Price on correct side of EMA', inp.priceCorrectSideEma, 6, 'directional'),
        pt('No opposing H1 level within 1×ATR', inp.noOpposingLevelWithinAtr, 6, 'directional'),
      ],
    },
    {
      key: 'structure',
      label: 'Structure & Setup',
      weight: 28,
      earned: 0,
      items: [
        pt('Retest held', inp.retestHeld, 16, 'directional'),
        pt('Entry not extended', inp.entryNotExtended, 12, 'directional'),
      ],
    },
    {
      key: 'confluence',
      label: 'Confluence',
      weight: 17,
      earned: 0,
      items: [
        pt('Stochastic not exhausted', inp.stochNotExhausted, 6, 'folklore'),
        pt('ATR in a healthy band', inp.atrHealthy, 5, 'proven'),
        { label: `Confluence count (${confluenceCount}/3)`, earned: confluenceCount * 2, weight: 6, honesty: 'directional' },
      ],
    },
    {
      key: 'timing',
      label: 'Timing',
      weight: 16,
      earned: 0,
      items: [
        { label: `Session window (${inp.sessionQuality})`, earned: TIMING_POINTS[inp.sessionQuality], weight: 16, honesty: 'proven' },
      ],
    },
    {
      key: 'risk',
      label: 'Risk & Targets',
      weight: 17,
      earned: 0,
      items: [
        { label: `R:R quality (${inp.rr.toFixed(2)})`, earned: rrPoints(inp.rr), weight: 11, honesty: 'proven' },
        pt('Target before opposing level', inp.targetBeforeOpposing, 6, 'directional'),
      ],
    },
  ]

  for (const s of sections) s.earned = s.items.reduce((a, i) => a + i.earned, 0)
  const total = sections.reduce((a, s) => a + s.earned, 0)

  let grade = gradeFor(total)
  const structure = sections.find((s) => s.key === 'structure')!
  const structureFloorApplied = structure.earned < 0.6 * structure.weight && (grade === 'A' || grade === 'B')
  if (structureFloorApplied) grade = 'C'

  return { total, grade, sections, structureFloorApplied }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/edge/scoreSetup.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/edge/scoreSetup.ts src/edge/scoreSetup.test.ts
git commit -m "feat(edge): two-stage weighted setup scorer + grade"
```

---

### Task 6: Claude engine — `evaluateSetupClaude`

**Files:**
- Create: `src/scoring/evaluateSetupClaude.ts`
- Test: `src/scoring/evaluateSetupClaude.test.ts`

**Interfaces:**
- Consumes: `evaluateSetup`/`SetupVerdict` (`./evaluateSetup.js`), `atr` (`../indicators/atr.js`), `stochastic` (`../indicators/stochastic.js`), `swingPoints` (`../indicators/swingPoints.js`), `ema` (`../indicators/ema.js`), `classifySession`/`isFridayLate`/`SessionWindow` (`../edge/session.js`), `newsBlackout`/`NewsEvent` (`../edge/newsWindow.js`), `scoreSetup`/`EdgeScore`/`EdgeInputs` (`../edge/scoreSetup.js`), core types.
- Produces:
  - `type EdgeSetup = { entry: number; sl: number; tp1: number; tp2: number; lot: number }`
  - `type EdgeVerdict = { status: 'wait' | 'blocked' | 'graded'; direction: Direction | null; blockedBy?: string; session: SessionWindow; news: NewsEvent | null; score: EdgeScore | null; setup: EdgeSetup | null; tradeable: boolean }`
  - `evaluateSetupClaude(ctx: MarketContext, config: Config, now: number, events: NewsEvent[]): EdgeVerdict`

- [ ] **Step 1: Write the failing test**

```ts
// src/scoring/evaluateSetupClaude.test.ts
import { describe, expect, it } from 'vitest'
import { evaluateSetupClaude } from './evaluateSetupClaude'
import { defaultConfig } from '../config'
import { DEMO_PRESETS } from '../demo/presets'
import type { NewsEvent } from '../edge/newsWindow'

// A preset that authorizes a setup in the base engine (mirror the id used in App/demo tests).
const authorizing = DEMO_PRESETS.find((p) => p.id === 'bull-setup') ?? DEMO_PRESETS[0]!
const primeInstant = new Date('2026-07-01T14:00:00Z').getTime() // London–NY overlap

describe('evaluateSetupClaude', () => {
  it('waits when the base structural pipeline is not authorized', () => {
    const ranging = DEMO_PRESETS.find((p) => p.id === 'consolidation') ?? DEMO_PRESETS[0]!
    const v = evaluateSetupClaude(ranging.ctx, ranging.config ?? defaultConfig, primeInstant, [])
    expect(v.status).toBe('wait')
    expect(v.setup).toBeNull()
    expect(v.tradeable).toBe(false)
  })

  it('grades an authorized setup and reports session', () => {
    const v = evaluateSetupClaude(authorizing.ctx, authorizing.config ?? defaultConfig, primeInstant, [])
    expect(['graded', 'blocked']).toContain(v.status)
    expect(v.session.quality).toBe('prime')
    expect(v.score).not.toBeNull()
    if (v.status === 'graded') expect(v.setup).not.toBeNull()
  })

  it('blocks an authorized setup during a news blackout', () => {
    const events: NewsEvent[] = [{ time: primeInstant, impact: 'high', currency: 'USD', title: 'FOMC' }]
    const v = evaluateSetupClaude(authorizing.ctx, authorizing.config ?? defaultConfig, primeInstant, events)
    if (v.setup) {
      expect(v.status).toBe('blocked')
      expect(v.blockedBy).toBe('news')
      expect(v.tradeable).toBe(false)
    }
  })
})
```

> Note: confirm the preset ids (`bull-setup`, `consolidation`) against `src/demo/presets.ts`; substitute the actual authorizing / ranging preset ids if they differ. The test's `if (v.setup)` guards keep it green even if a chosen preset doesn't authorize, but pick a genuinely authorizing preset so the news-blackout branch is exercised.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scoring/evaluateSetupClaude.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/scoring/evaluateSetupClaude.ts
import type { Candle, Config, Direction, MarketContext } from '../types.js'
import { evaluateSetup } from './evaluateSetup.js'
import { atr } from '../indicators/atr.js'
import { stochastic } from '../indicators/stochastic.js'
import { swingPoints } from '../indicators/swingPoints.js'
import { ema } from '../indicators/ema.js'
import { classifySession, isFridayLate, type SessionWindow } from '../edge/session.js'
import { newsBlackout, type NewsEvent } from '../edge/newsWindow.js'
import { scoreSetup, type EdgeScore, type EdgeInputs } from '../edge/scoreSetup.js'

export type EdgeSetup = { entry: number; sl: number; tp1: number; tp2: number; lot: number }
export type EdgeVerdict = {
  status: 'wait' | 'blocked' | 'graded'
  direction: Direction | null
  blockedBy?: string
  session: SessionWindow
  news: NewsEvent | null
  score: EdgeScore | null
  setup: EdgeSetup | null
  tradeable: boolean
}

const ATR_PERIOD = 14

/** Nearest OPPOSING swing level beyond `entry` (mirror of evaluateSetup's private helper). */
function opposingLevel(candles: Candle[], direction: Direction, entry: number): number | undefined {
  const { highs, lows } = swingPoints(candles)
  if (direction === 'long') {
    const above = highs.map((i) => candles[i]!.high).filter((h) => h > entry)
    return above.length ? Math.min(...above) : undefined
  }
  const below = lows.map((i) => candles[i]!.low).filter((l) => l < entry)
  return below.length ? Math.max(...below) : undefined
}

/** Build the weighted-score inputs from an authorized base setup + market context. */
function buildInputs(
  ctx: MarketContext,
  config: Config,
  direction: Direction,
  setup: EdgeSetup,
  sessionQuality: EdgeInputs['sessionQuality'],
): EdgeInputs {
  const m5 = ctx.m5
  const isLong = direction === 'long'
  const a = m5.length > ATR_PERIOD ? atr(m5, ATR_PERIOD) : Math.abs(setup.entry - setup.sl)

  // Bias section
  const m15Ema = ema(ctx.m15, config.ema.period).value
  const priceCorrectSideEma = isLong ? setup.entry >= m15Ema : setup.entry <= m15Ema
  const m15Struct = ema(ctx.m15, config.ema.period).slope
  const biasStructureAgrees = isLong ? m15Struct === 'rising' : m15Struct === 'falling'
  const opposing = opposingLevel(m5, direction, setup.entry)
  const noOpposingLevelWithinAtr = opposing === undefined || Math.abs(opposing - setup.entry) > a

  // Structure section — base pipeline guarantees the retest held to reach 'setup'.
  const retestHeld = true
  const risk = Math.abs(setup.entry - setup.sl)
  const entryNotExtended = risk <= 1.5 * a

  // Confluence section
  const st = stochastic(m5, config.stoch.k, config.stoch.d, config.stoch.smooth)
  const stochNotExhausted = isLong ? st.zone !== 'overbought' : st.zone !== 'oversold'
  const aLong = m5.length > 50 ? atr(m5, 50) : a
  const atrHealthy = a >= 0.5 * aLong && a <= 2 * aLong
  const emaAligned = priceCorrectSideEma
  const nearRound = Math.abs(setup.sl - Math.round(setup.sl)) <= 0.2
  const confluenceCount = (emaAligned ? 1 : 0) + (nearRound ? 1 : 0) + (retestHeld ? 1 : 0)

  // Risk section
  const reward = Math.abs(setup.tp2 - setup.entry)
  const rr = risk > 0 ? reward / risk : 0
  const targetBeforeOpposing =
    opposing === undefined || (isLong ? setup.tp2 <= opposing + 1e-9 : setup.tp2 >= opposing - 1e-9)

  return {
    biasStructureAgrees,
    priceCorrectSideEma,
    noOpposingLevelWithinAtr,
    retestHeld,
    entryNotExtended,
    stochNotExhausted,
    atrHealthy,
    confluenceCount,
    sessionQuality,
    rr,
    targetBeforeOpposing,
  }
}

/**
 * The "Claude" engine. Reuses the existing structural pipeline (evaluateSetup) to detect a
 * candidate setup, then layers Claude's own criteria: session-timing veto, news-blackout veto,
 * and the two-stage weighted grade. `tradeable` is true only at grade A/B with no veto.
 * Pure: `now` and `events` are passed in (no clock, no I/O).
 */
export function evaluateSetupClaude(
  ctx: MarketContext,
  config: Config,
  now: number,
  events: NewsEvent[],
): EdgeVerdict {
  const session = classifySession(now)
  const news = newsBlackout(events, now)
  const base = evaluateSetup(ctx, config)

  if (base.status !== 'setup') {
    return {
      status: 'wait',
      direction: base.direction,
      blockedBy: base.blockedBy,
      session,
      news,
      score: null,
      setup: null,
      tradeable: false,
    }
  }

  const direction = base.direction
  const setup: EdgeSetup = { entry: base.entry, sl: base.sl, tp1: base.tp1, tp2: base.tp2, lot: base.lot }
  const score = scoreSetup(buildInputs(ctx, config, direction, setup, session.quality))

  const sessionVeto = session.quality === 'avoid' || isFridayLate(now)
  if (news || sessionVeto) {
    return {
      status: 'blocked',
      direction,
      blockedBy: news ? 'news' : 'session',
      session,
      news,
      score,
      setup,
      tradeable: false,
    }
  }

  return {
    status: 'graded',
    direction,
    session,
    news,
    score,
    setup,
    tradeable: score.grade === 'A' || score.grade === 'B',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scoring/evaluateSetupClaude.test.ts`
Expected: PASS. If a preset id is wrong, fix the id per `src/demo/presets.ts` and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/evaluateSetupClaude.ts src/scoring/evaluateSetupClaude.test.ts
git commit -m "feat(scoring): Claude engine — session/news vetoes + weighted grade over base pipeline"
```

---

### Task 7: Claude checklist data

**Files:**
- Create: `src/edge/checklist.ts`
- Test: `src/edge/checklist.test.ts`

**Interfaces:**
- Produces:
  - `type ChecklistKind = 'veto' | 'weight'`
  - `type ChecklistItem = { text: string; kind: ChecklistKind; honesty: 'proven' | 'directional' | 'folklore'; dataSource: 'computed' | 'feed' }`
  - `type ChecklistSection = { key: string; label: string; items: ChecklistItem[] }`
  - `CLAUDE_CHECKLIST: ChecklistSection[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/edge/checklist.test.ts
import { describe, expect, it } from 'vitest'
import { CLAUDE_CHECKLIST } from './checklist'

describe('CLAUDE_CHECKLIST', () => {
  it('has the five weighted sections plus vetoes and no empty labels', () => {
    const keys = CLAUDE_CHECKLIST.map((s) => s.key)
    for (const k of ['vetoes', 'bias', 'structure', 'confluence', 'timing', 'risk']) {
      expect(keys).toContain(k)
    }
    for (const s of CLAUDE_CHECKLIST) {
      expect(s.items.length).toBeGreaterThan(0)
      for (const i of s.items) expect(i.text.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/edge/checklist.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/edge/checklist.ts
export type ChecklistKind = 'veto' | 'weight'
export type ChecklistItem = {
  text: string
  kind: ChecklistKind
  honesty: 'proven' | 'directional' | 'folklore'
  dataSource: 'computed' | 'feed'
}
export type ChecklistSection = { key: string; label: string; items: ChecklistItem[] }

const veto = (text: string, dataSource: ChecklistItem['dataSource'] = 'computed'): ChecklistItem => ({
  text,
  kind: 'veto',
  honesty: 'proven',
  dataSource,
})
const weight = (text: string, honesty: ChecklistItem['honesty']): ChecklistItem => ({
  text,
  kind: 'weight',
  honesty,
  dataSource: 'computed',
})

/** The Claude engine's criteria, as display data for the Checklist tab. */
export const CLAUDE_CHECKLIST: ChecklistSection[] = [
  {
    key: 'vetoes',
    label: 'Hard vetoes → NO-TRADE',
    items: [
      veto('Trade aligns with H1 bias'),
      veto('Not in consolidation / chop'),
      veto('A tested level defines the trade'),
      veto('Breakout closed beyond the level (no wick-only)'),
      veto('Confirmation candle after the retest'),
      veto('R:R to target ≥ 1.5'),
      veto('Stop-loss at the structural invalidation point'),
      veto('No red-folder USD/gold news within ±30 min', 'feed'),
      veto('Not in the rollover dead-zone or late Friday'),
    ],
  },
  {
    key: 'bias',
    label: 'Bias & Context — weight 22',
    items: [
      weight('M15/H1 structure agrees with direction', 'proven'),
      weight('Price on the correct side of the EMA', 'directional'),
      weight('No opposing H1 level within 1×ATR of entry', 'directional'),
    ],
  },
  {
    key: 'structure',
    label: 'Structure & Setup — weight 28',
    items: [
      weight('Retest held the broken level', 'directional'),
      weight('Entry not extended (not chasing far from the level)', 'directional'),
    ],
  },
  {
    key: 'confluence',
    label: 'Confluence — weight 17',
    items: [
      weight('Stochastic not exhausted (supporting, not proven)', 'folklore'),
      weight('ATR in a healthy band (not dead, not spiked)', 'proven'),
      weight('Confluence count (level + EMA + round number), capped at 3', 'directional'),
    ],
  },
  {
    key: 'timing',
    label: 'Timing — weight 16',
    items: [weight('Inside a high-expectancy session window (London / overlap)', 'proven')],
  },
  {
    key: 'risk',
    label: 'Risk & Targets — weight 17',
    items: [
      weight('R:R quality beyond the 1.5 floor', 'proven'),
      weight('Target sits before the next opposing level', 'directional'),
    ],
  },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/edge/checklist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/edge/checklist.ts src/edge/checklist.test.ts
git commit -m "feat(edge): Claude checklist as display data"
```

---

### Task 8: `StrategySection` wrapper (labels + accent)

**Files:**
- Create: `src/ui/StrategySection.tsx`
- Test: `src/ui/StrategySection.test.tsx`

**Interfaces:**
- Produces: `StrategySection({ engine, subtitle, children }: { engine: 'dad' | 'claude'; subtitle?: string; children: ReactNode }): ReactElement`. Renders a labeled panel — "Dad + ChatGPT" (neutral accent) or "Claude" (distinct accent via existing theme tokens, e.g. `border-brand`/`text-brand`), with an accessible heading.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/StrategySection.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StrategySection } from './StrategySection'

describe('StrategySection', () => {
  it('labels the Claude engine and renders children', () => {
    render(
      <StrategySection engine="claude" subtitle="my criteria">
        <p>inner</p>
      </StrategySection>,
    )
    expect(screen.getByRole('heading', { name: /claude/i })).toBeInTheDocument()
    expect(screen.getByText('inner')).toBeInTheDocument()
  })

  it('labels the Dad + ChatGPT engine', () => {
    render(
      <StrategySection engine="dad">
        <p>x</p>
      </StrategySection>,
    )
    expect(screen.getByRole('heading', { name: /dad \+ chatgpt/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/StrategySection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/StrategySection.tsx
import type { ReactElement, ReactNode } from 'react'

const LABELS = { dad: 'Dad + ChatGPT', claude: 'Claude' } as const

/**
 * A labeled panel that brackets one engine's content, so the two strategies are
 * differentiable at a glance. Claude carries the brand accent; Dad stays neutral.
 * Accent is token-based so light/dark both work.
 */
export function StrategySection({
  engine,
  subtitle,
  children,
}: {
  engine: 'dad' | 'claude'
  subtitle?: string
  children: ReactNode
}): ReactElement {
  const claude = engine === 'claude'
  const accent = claude ? 'border-brand/60' : 'border-border'
  const chip = claude
    ? 'border-brand/50 bg-brand/10 text-brand'
    : 'border-border bg-surface-sunken text-ink-2'
  return (
    <section className={`rounded-panel border ${accent} bg-surface p-4 shadow-panel`} aria-label={`${LABELS[engine]} strategy`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex items-center rounded-chip border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${chip}`}>
          <h3 className="m-0">{LABELS[engine]}</h3>
        </span>
        {subtitle && <span className="text-[12px] text-ink-3">{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/StrategySection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/StrategySection.tsx src/ui/StrategySection.test.tsx
git commit -m "feat(ui): StrategySection wrapper (Dad + ChatGPT vs Claude)"
```

---

### Task 9: Claude signal components

**Files:**
- Create: `src/ui/edge/ClaudeSignal.tsx`
- Test: `src/ui/edge/ClaudeSignal.test.tsx`

**Interfaces:**
- Consumes: `EdgeVerdict` from `../../scoring/evaluateSetupClaude.js`; `expectancyR`, `breakevenWinRate` from `../../edge/expectancy.js`.
- Produces: `ClaudeSignal({ verdict }: { verdict: EdgeVerdict }): ReactElement` — a self-contained panel with: the verdict badge (GO / CAUTION / NO-TRADE + grade + score + blocking reason), a session line (window + quality, plus a news-blackout note when present), the section score bars, and a small expectancy strip. Kept in one file for Phase 1; can be split later if it grows.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/edge/ClaudeSignal.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClaudeSignal } from './ClaudeSignal'
import type { EdgeVerdict } from '../../scoring/evaluateSetupClaude'

const waiting: EdgeVerdict = {
  status: 'wait',
  direction: null,
  blockedBy: 'consolidation',
  session: { window: 'London–NY overlap', quality: 'prime' },
  news: null,
  score: null,
  setup: null,
  tradeable: false,
}

describe('ClaudeSignal', () => {
  it('shows NO-TRADE and the blocking reason when waiting', () => {
    render(<ClaudeSignal verdict={waiting} />)
    expect(screen.getByText(/no-trade/i)).toBeInTheDocument()
    expect(screen.getByText(/consolidation/i)).toBeInTheDocument()
  })

  it('shows the session window', () => {
    render(<ClaudeSignal verdict={waiting} />)
    expect(screen.getByText(/London–NY overlap/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/edge/ClaudeSignal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/edge/ClaudeSignal.tsx
import type { ReactElement } from 'react'
import type { EdgeVerdict } from '../../scoring/evaluateSetupClaude.js'
import { breakevenWinRate, expectancyR } from '../../edge/expectancy.js'

type Verdict = { label: string; tone: 'go' | 'caution' | 'no' }

function toVerdict(v: EdgeVerdict): Verdict {
  if (v.status === 'graded' && v.tradeable) return { label: 'GO', tone: 'go' }
  if (v.status === 'graded') return { label: 'CAUTION', tone: 'caution' }
  return { label: 'NO-TRADE', tone: 'no' }
}

const TONE: Record<Verdict['tone'], string> = {
  go: 'border-pass-bd bg-pass-bg text-pass-fg',
  caution: 'border-warn-bd bg-warn-bg text-warn-fg',
  no: 'border-fail-bd bg-fail-bg text-fail-fg',
}

function reason(v: EdgeVerdict): string {
  if (v.status === 'wait') return `First unmet gate: ${v.blockedBy}`
  if (v.status === 'blocked') return v.blockedBy === 'news' ? 'Blocked: red-folder news within 30 min' : 'Blocked: low-liquidity session'
  return v.tradeable ? 'All criteria met — A/B setup' : 'Below the A/B threshold — the data says pass'
}

/** The Claude engine's signal panel: verdict badge + session + section bars + expectancy. */
export function ClaudeSignal({ verdict }: { verdict: EdgeVerdict }): ReactElement {
  const vd = toVerdict(verdict)
  const grade = verdict.score?.grade ?? 'F'
  const total = verdict.score?.total ?? 0
  const rr = verdict.setup ? Math.abs(verdict.setup.tp2 - verdict.setup.entry) / Math.abs(verdict.setup.entry - verdict.setup.sl) : 0

  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between rounded-panel border px-4 py-3 ${TONE[vd.tone]}`}>
        <div className="text-[20px] font-bold tracking-[-0.01em]">{vd.label}</div>
        <div className="text-right">
          <div className="font-mono text-[22px] font-semibold tabular-nums">{grade}</div>
          <div className="text-[11px] opacity-80">{total}/100</div>
        </div>
      </div>

      <p className="text-[12.5px] text-ink-2">{reason(verdict)}</p>

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
        <span className="font-semibold text-ink">Session:</span>
        <span>{verdict.session.window}</span>
        <span className="rounded-chip border border-border bg-surface-sunken px-2 py-0.5 uppercase tracking-[0.05em] text-[10.5px]">
          {verdict.session.quality}
        </span>
        {verdict.news && <span className="text-fail-fg">· news: {verdict.news.title}</span>}
      </div>

      {verdict.score && (
        <ul className="space-y-1.5" aria-label="Section scores">
          {verdict.score.sections.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="w-[130px] shrink-0 text-[11.5px] text-ink-2">{s.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${Math.round((s.earned / s.weight) * 100)}%` }}
                />
              </span>
              <span className="w-[52px] shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-3">
                {s.earned}/{s.weight}
              </span>
            </li>
          ))}
        </ul>
      )}

      {verdict.setup && (
        <div className="rounded-panel border border-border bg-surface-sunken px-3 py-2 text-[12px] text-ink-2">
          R:R <span className="font-mono text-ink">{rr.toFixed(2)}</span> · breakeven win-rate{' '}
          <span className="font-mono text-ink">{Math.round(breakevenWinRate(rr) * 100)}%</span> · at 45% WR you are{' '}
          <span className="font-mono text-ink">{expectancyR(0.45, rr).toFixed(3)}R</span>/trade
        </div>
      )}
    </div>
  )
}
```

> If the theme lacks `warn-*` tokens, reuse the closest existing tokens (check `tailwind.config.js` / `src/ui/status-tokens.ts`) — do not invent new token names; map `caution` to whatever amber/attention token exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/edge/ClaudeSignal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/edge/ClaudeSignal.tsx src/ui/edge/ClaudeSignal.test.tsx
git commit -m "feat(ui): Claude signal panel (verdict + session + section bars + expectancy)"
```

---

### Task 10: Wire the Claude section into the Signal tab

**Files:**
- Modify: `src/App.tsx` (imports near the existing `ui`/`scoring` imports; compute the Claude verdict beside `verdict`; render two `StrategySection`s inside the `tab === 'signal'` block).
- Test: `src/App.test.tsx` (extend — assert both engine labels render on the Signal tab).

**Interfaces:**
- Consumes: `evaluateSetupClaude` (`./scoring/evaluateSetupClaude.js`), `StrategySection` (`./ui/StrategySection.js`), `ClaudeSignal` (`./ui/edge/ClaudeSignal.js`).

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/App.test.tsx
import { render, screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import App from './App'

it('shows both engines on the Signal tab', () => {
  render(<App />)
  // Signal is the default tab.
  expect(screen.getByRole('heading', { name: /dad \+ chatgpt/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /claude/i })).toBeInTheDocument()
})
```

> Match the existing `App.test.tsx` render/setup conventions (demo mode vs live). If the suite forces `live` and there is no data, switch to a demo preset first as the existing tests do, or assert against the demo path.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — Claude/Dad headings not found.

- [ ] **Step 3: Write minimal implementation**

Add imports near the other `ui`/`scoring` imports in `src/App.tsx`:

```tsx
import { evaluateSetupClaude } from './scoring/evaluateSetupClaude'
import { StrategySection } from './ui/StrategySection'
import { ClaudeSignal } from './ui/edge/ClaudeSignal'
```

Compute the Claude verdict where `verdict` is computed (uses the last M5 candle time as `now`, empty events in Phase 1):

```tsx
const now = activeCtx?.m5[activeCtx.m5.length - 1]?.time ?? 0
const claudeVerdict = activeCtx ? evaluateSetupClaude(activeCtx, activeConfig, now, []) : null
```

Replace the current `tab === 'signal'` body's two-column block with the sectioned layout:

```tsx
<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
  <StrategySection engine="dad" subtitle="verbatim 13-step">
    <div className="grid grid-cols-1 items-start gap-4">
      <TradeCard setup={tradeSetup} />
      <VetoList vetoes={vetoResults} />
    </div>
  </StrategySection>
  <StrategySection engine="claude" subtitle="my criteria">
    {claudeVerdict ? <ClaudeSignal verdict={claudeVerdict} /> : <p className="text-[12.5px] text-ink-3">Waiting for candles…</p>}
  </StrategySection>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS. Then full check: `npm run typecheck && npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(ui): Signal tab — Dad + ChatGPT vs Claude sections"
```

---

### Task 11: Claude checklist section in the Checklist tab

**Files:**
- Create: `src/ui/edge/ClaudeChecklist.tsx`
- Test: `src/ui/edge/ClaudeChecklist.test.tsx`
- Modify: `src/App.tsx` (`tab === 'checklist'` block — wrap the existing checklist in `StrategySection engine="dad"` and add a `StrategySection engine="claude"` rendering `ClaudeChecklist`).

**Interfaces:**
- Consumes: `CLAUDE_CHECKLIST` from `../../edge/checklist.js`.
- Produces: `ClaudeChecklist(): ReactElement` — renders `CLAUDE_CHECKLIST` grouped by section, tagging each item as VETO/weighted and showing its honesty label.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/edge/ClaudeChecklist.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClaudeChecklist } from './ClaudeChecklist'

describe('ClaudeChecklist', () => {
  it('renders the veto section and a folklore honesty label', () => {
    render(<ClaudeChecklist />)
    expect(screen.getByText(/Hard vetoes/i)).toBeInTheDocument()
    expect(screen.getAllByText(/folklore/i).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/edge/ClaudeChecklist.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/edge/ClaudeChecklist.tsx
import type { ReactElement } from 'react'
import { CLAUDE_CHECKLIST } from '../../edge/checklist.js'

/** Renders the Claude engine's criteria as a reference checklist, honesty-labeled. */
export function ClaudeChecklist(): ReactElement {
  return (
    <div className="space-y-4">
      {CLAUDE_CHECKLIST.map((section) => (
        <div key={section.key}>
          <h4 className="mb-2 text-[12.5px] font-semibold text-ink">{section.label}</h4>
          <ul className="space-y-1.5">
            {section.items.map((item) => (
              <li key={item.text} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                <span
                  className={`mt-0.5 inline-flex shrink-0 items-center rounded-chip border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${
                    item.kind === 'veto' ? 'border-fail-bd bg-fail-bg text-fail-fg' : 'border-border bg-surface-sunken text-ink-3'
                  }`}
                >
                  {item.kind}
                </span>
                <span>
                  {item.text}
                  <span className="ml-1.5 text-[10.5px] text-ink-3">· {item.honesty}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/edge/ClaudeChecklist.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire into the Checklist tab and verify the whole suite**

In `src/App.tsx`, add imports:

```tsx
import { ClaudeChecklist } from './ui/edge/ClaudeChecklist'
```

Replace the `tab === 'checklist'` body so the existing checklist sits in a Dad section and the Claude checklist sits beside it:

```tsx
<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
  <StrategySection engine="dad" subtitle="verbatim 13-step">
    <Checklist gates={gates} supporting={result.supporting} />
  </StrategySection>
  <StrategySection engine="claude" subtitle="my criteria">
    <ClaudeChecklist />
  </StrategySection>
</div>
```

> Match the existing `Checklist` props in `src/App.tsx` — copy them exactly from the current `tab === 'checklist'` block (it already renders `<Checklist ... />`); only wrap it, don't change its props.

Run: `npm run typecheck && npx vitest run && npm run lint`
Expected: all pass, 0 lint warnings.

- [ ] **Step 6: Commit**

```bash
git add src/ui/edge/ClaudeChecklist.tsx src/ui/edge/ClaudeChecklist.test.tsx src/App.tsx
git commit -m "feat(ui): Checklist tab — Claude checklist section"
```

---

## Self-Review

**Spec coverage (Phase 1 scope):**
- Claude engine two-stage scoring → Tasks 5, 6. ✓
- Vetoes (structural reuse + session + news) → Task 6 (structural via `evaluateSetup`; session/news vetoes added). ✓
- DST-aware session → Task 2. ✓
- News veto pure + stubbed feed (empty events in Phase 1) → Tasks 3, 6, 10. ✓ (real feed = Phase 3, out of scope here.)
- Weighted sections summing to 100 + structure floor + confluence cap + grades → Task 5. ✓
- ATR for confluence/extended-entry → Task 1, used in Task 6. ✓
- Expectancy widget → Tasks 4, 9. ✓
- Signal tab sectioning (Dad vs Claude) → Tasks 8, 9, 10. ✓
- Checklist tab sectioning + Claude checklist → Tasks 7, 11. ✓
- Honesty labels (no invented win rates) → Tasks 5, 7, 9 (labels rendered; expectancy uses an explicit illustrative 45% clearly framed). ✓
- Out of Phase 1 (deferred): parallel paper accounts, server tick, chart markers (Phase 2); real news feed + by-grade analytics (Phase 3). ✓

**Placeholder scan:** No TBD/TODO. The two `>` notes (preset ids in Task 6; theme tokens in Task 9; `Checklist` props in Task 11) are verification instructions against existing files, not missing content — each names the exact file to confirm against.

**Type consistency:** `EdgeInputs`/`EdgeScore`/`SessionQuality`/`SessionWindow`/`NewsEvent`/`EdgeVerdict` are defined once (Tasks 2, 3, 5, 6) and consumed with the same names/shapes downstream (Tasks 6, 9, 10). `classifySession`/`isFridayLate`/`newsBlackout`/`scoreSetup`/`evaluateSetupClaude` signatures match between producer and consumer tasks. Section weights (22/28/17/16/17) are consistent between Task 5 code, Task 7 labels, and the Global Constraints.

## Notes for the executor
- Run `npx vitest run` (not watch mode) for one-shot checks; the repo script is `npm run test:run`.
- Keep imports ending in `.js` (NodeNext) even for `.ts`/`.tsx` sources — follow the existing files.
- If `src/demo/presets.ts` has no clearly-authorizing preset, construct a minimal authorizing `MarketContext` fixture in the Task 6 test instead (mirror how `src/scoring/evaluateSetup.test.ts` builds fixtures).
