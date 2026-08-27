# Dual-Engine Bake-off — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the "Claude" engine as a second automated paper-trading forward-test beside the existing "Dad + ChatGPT" one — its own credit account under identical economics, advanced on the same server tick, with its own trade history and each trade tagged with its pre-trade grade — and show both accounts side-by-side in the Paper tab.

**Architecture:** Generalize the existing sim so one tick advances two independent `SimState`s from the same candles. `advanceSim` takes an explicit pre-computed signal (caller chooses the engine). The server blob (`SimBlob`) grows a second state (`claudeState` / `claudeLastProcessedTime`); `applyTick` advances both. The Redis key bumps to `sim:v2` so both accounts start fresh from the same point (a fair, simultaneous start — required for a valid comparison). `/api/sim-state` returns both; `useServerSim` exposes both; the Paper tab renders two `SimPanel`s inside `StrategySection`s. Each Claude paper trade carries its grade (sets up Phase 3's by-grade analytics).

**Tech Stack:** TypeScript (strict, NodeNext ESM — imports end in `.js`), React 18, Vite, Tailwind, Vitest, Vercel serverless (`api/`), Upstash Redis.

## Global Constraints

- Read-only / paper only — no order execution. The sim is an automated forward-test; no human input.
- Import direction one-way downward: `indicators → gates → scoring/edge → sim → ui`. `sim` may import type-only from `edge` (e.g. the `Grade` type); no upward imports.
- Pure engine/sim modules: no clock/IO/randomness inside `src/sim` or `src/edge` or `src/scoring`; timestamps/`now` are passed in. Server I/O lives only in `api/` and reads the clock via `Date.now()` there (as the existing handlers already do).
- **Identical economics:** both accounts use the SAME `SimConfig` (same `startingBalance` = 200, same `riskPct`, same `contractSize`). Only the *decision* (which engine authorizes) differs.
- **Fair start / reset together:** the Redis key becomes `sim:v2`; both accounts initialize from `initialSimState(simConfig)` at the same time. Admin `reset=1` resets both. (Consequence: the old `sim:v1` Dad history is abandoned — intended, so the bake-off starts clean and comparable.)
- Claude's paper signal authorizes ONLY when `evaluateSetupClaude` returns `status === 'graded' && tradeable` (grade A or B, no veto). Entry/SL/TP come from the verdict's `setup` (`tp2` is the paper target, matching Dad's `verdictToSignal`).
- Phase 2 passes an EMPTY news events array to `evaluateSetupClaude` (real feed is Phase 3) and uses the server `now` for session/news classification.
- Backward compatibility: adding `grade?` to `SimPosition`/`SimTrade`/`SetupSignal` must be OPTIONAL so Dad (which omits it) and the existing tests keep working.
- **Out of Phase 2 scope (deferred, not silently cut):** per-engine chart markers on `PriceChart` (visual-only; the chart is a stable, complex lightweight-charts component) and the win-rate-by-grade analytics view (Phase 3). Grade *tagging* on trades IS in Phase 2; the analytics *view* is Phase 3.
- Reference files: `src/forwardTest.ts`, `src/sim/{engine,types,stats,config}.ts`, `src/serverTick.ts`, `api/{sim-tick,sim-state}.ts`, `src/hooks/useServerSim.ts`, `src/ui/SimPanel.tsx`, `src/scoring/evaluateSetupClaude.ts` (the `EdgeVerdict` type), `src/App.tsx` (Paper tab).

---

### Task 1: Tag positions/trades with an optional grade

**Files:**
- Modify: `src/sim/types.ts` (add `grade?` to `SimPosition`; it flows into `SimTrade` via the spread), `src/sim/engine.ts` (propagate `signal.grade` in `maybeOpen`; extend `SetupSignal`).
- Test: `src/sim/engine.test.ts` (add a grade-propagation case).

**Interfaces:**
- Consumes: `Grade` type from `../edge/scoreSetup.js` (type-only import).
- Produces: `SetupSignal` authorized variant gains optional `grade?: Grade`; `SimPosition`/`SimTrade` gain optional `grade?: Grade`; `maybeOpen`/`simStep` copy it onto the opened position.

- [ ] **Step 1: Write the failing test**

Add to `src/sim/engine.test.ts`:

```ts
import { simStep, type SetupSignal } from './engine'
// (existing imports/initialSimState assumed present in this file)

it('tags the opened position and resulting trade with the signal grade', () => {
  const config = { startingBalance: 200, riskPct: 0.01, contractSize: 100 }
  let s = initialSimState(config)
  const signal: SetupSignal = { authorized: true, direction: 'long', entry: 100, sl: 95, tp: 110, grade: 'A' }
  // Open on a candle that neither hits SL nor TP.
  s = simStep(s, signal, config, { time: 1, open: 100, high: 101, low: 99, close: 100 })
  expect(s.open?.grade).toBe('A')
  // Close it on a candle that hits TP → the trade inherits the grade.
  s = simStep(s, { authorized: false }, config, { time: 2, open: 100, high: 111, low: 100, close: 110 })
  expect(s.trades[0]?.grade).toBe('A')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/engine.test.ts`
Expected: FAIL — `grade` not on `SetupSignal` / `open.grade` undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/types.ts`, add a type-only import at the top and a `grade?` field to `SimPosition`:

```ts
import type { Direction } from '../types.js'
import type { Grade } from '../edge/scoreSetup.js'
```

```ts
export type SimPosition = {
  id: string
  direction: Direction
  entry: number
  sl: number
  tp: number
  riskCredits: number
  lot: number
  rr: number
  openedAtTime: number
  grade?: Grade         // pre-trade quality grade (Claude engine); omitted by the Dad engine
}
```

(`SimTrade = SimPosition & { ... }` already spreads `grade` through — no change needed there.)

In `src/sim/engine.ts`, extend the authorized `SetupSignal` and propagate the grade in `maybeOpen`:

```ts
import type { Grade } from '../edge/scoreSetup.js'

export type SetupSignal =
  | { authorized: true; direction: Direction; entry: number; sl: number; tp: number; grade?: Grade }
  | { authorized: false }
```

In `maybeOpen`, add `grade: signal.grade` to the constructed `pos` object (it is `undefined` for Dad, set for Claude):

```ts
  const pos: SimPosition = {
    id: `t${state.nextId}`,
    direction: signal.direction,
    entry: signal.entry,
    sl: signal.sl,
    tp: signal.tp,
    riskCredits,
    lot: riskCredits / (riskDist * config.contractSize),
    rr: rewardDist / riskDist,
    openedAtTime: candle.time,
    grade: signal.grade,
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/engine.test.ts`
Expected: PASS (existing cases + the new grade case).

- [ ] **Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/engine.ts src/sim/engine.test.ts
git commit -m "feat(sim): optional per-trade grade on positions/trades"
```

---

### Task 2: `claudeVerdictToSignal` mapping

**Files:**
- Modify: `src/forwardTest.ts` (add the mapping beside `verdictToSignal`).
- Test: `src/forwardTest.test.ts` (add cases).

**Interfaces:**
- Consumes: `EdgeVerdict` from `./scoring/evaluateSetupClaude.js`; `SetupSignal` from `./sim/engine.js`.
- Produces: `claudeVerdictToSignal(verdict: EdgeVerdict): SetupSignal`.

- [ ] **Step 1: Write the failing test**

Add to `src/forwardTest.test.ts`:

```ts
import { claudeVerdictToSignal } from './forwardTest'
import type { EdgeVerdict } from './scoring/evaluateSetupClaude'

const gradedTradeable: EdgeVerdict = {
  status: 'graded', direction: 'long',
  session: { window: 'London–NY overlap', quality: 'prime' }, news: null,
  score: { total: 92, grade: 'A', sections: [], structureFloorApplied: false },
  setup: { entry: 100, sl: 95, tp1: 105, tp2: 110, lot: 0.1 }, tradeable: true,
}

describe('claudeVerdictToSignal', () => {
  it('authorizes an A/B graded, tradeable setup and carries entry/sl/tp2 + grade', () => {
    const sig = claudeVerdictToSignal(gradedTradeable)
    expect(sig).toEqual({ authorized: true, direction: 'long', entry: 100, sl: 95, tp: 110, grade: 'A' })
  })
  it('does not authorize a blocked verdict even with a high grade', () => {
    const blocked: EdgeVerdict = { ...gradedTradeable, status: 'blocked', blockedBy: 'news', tradeable: false }
    expect(claudeVerdictToSignal(blocked)).toEqual({ authorized: false })
  })
  it('does not authorize a graded-but-not-tradeable (C/D) setup', () => {
    const marginal: EdgeVerdict = { ...gradedTradeable, tradeable: false, score: { total: 70, grade: 'C', sections: [], structureFloorApplied: false } }
    expect(claudeVerdictToSignal(marginal)).toEqual({ authorized: false })
  })
  it('does not authorize a wait verdict', () => {
    const wait: EdgeVerdict = { status: 'wait', direction: null, blockedBy: 'consolidation', session: { window: 'x', quality: 'low' }, news: null, score: null, setup: null, tradeable: false }
    expect(claudeVerdictToSignal(wait)).toEqual({ authorized: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/forwardTest.test.ts`
Expected: FAIL — `claudeVerdictToSignal` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/forwardTest.ts` (imports at top, function beside `verdictToSignal`):

```ts
import type { EdgeVerdict } from './scoring/evaluateSetupClaude.js'
```

```ts
/**
 * Map a Claude EdgeVerdict to the sim's narrow signal. Authorizes ONLY a graded, tradeable
 * setup (grade A/B, no veto); tp2 is the paper target, matching verdictToSignal. Carries the
 * grade so the paper trade is tagged with its pre-trade quality.
 */
export function claudeVerdictToSignal(verdict: EdgeVerdict): SetupSignal {
  if (verdict.status === 'graded' && verdict.tradeable && verdict.setup && verdict.direction && verdict.score) {
    return {
      authorized: true,
      direction: verdict.direction,
      entry: verdict.setup.entry,
      sl: verdict.setup.sl,
      tp: verdict.setup.tp2,
      grade: verdict.score.grade,
    }
  }
  return { authorized: false }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/forwardTest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/forwardTest.ts src/forwardTest.test.ts
git commit -m "feat(sim): map Claude EdgeVerdict to a paper signal (A/B only, grade-tagged)"
```

---

### Task 3: Make `advanceSim` engine-agnostic (explicit signal)

**Files:**
- Modify: `src/forwardTest.ts` (`advanceSim` takes the signal as a parameter instead of computing `evaluateSetup` internally).
- Test: `src/forwardTest.test.ts` (update existing `advanceSim` calls to pass a signal).

**Interfaces:**
- Produces: `advanceSim(state: SimState, lastProcessedTime: number | null, ctx: MarketContext, config: Config, signal: SetupSignal): { state: SimState; lastProcessedTime: number | null }`.
- Note: this is a signature change. The only production caller is `applyTick` in `src/serverTick.ts` (updated in Task 5). Update all `advanceSim` call sites in `src/forwardTest.test.ts` too.

- [ ] **Step 1: Update the failing test(s)**

In `src/forwardTest.test.ts`, every existing `advanceSim(state, last, ctx, config)` call must now pass a signal as the 5th arg. For the Dad-behavior cases, compute it the same way the code used to:

```ts
import { advanceSim, verdictToSignal } from './forwardTest'
import { evaluateSetup } from './scoring/evaluateSetup'

// Example of the updated call pattern used throughout this file:
const dadSignal = verdictToSignal(evaluateSetup(ctx, config))
const result = advanceSim(state, last, ctx, config, dadSignal)
```

Add one new assertion proving the signal is honored (an authorized signal opens a position on a fresh candle):

```ts
it('opens from the passed signal, not an internally-computed one', () => {
  const config = defaultConfig
  const start = initialSimState(simConfigFrom(config))
  // Seed the watermark first (first run never backfills).
  const seeded = advanceSim(start, null, ctx, config, { authorized: false })
  const openSig = { authorized: true, direction: 'long', entry: 100, sl: 95, tp: 110, grade: 'B' } as const
  const nextCtx = { ...ctx, m5: [...ctx.m5, { time: (seeded.lastProcessedTime ?? 0) + 300_000, open: 100, high: 101, low: 99, close: 100 }] }
  const out = advanceSim(seeded.state, seeded.lastProcessedTime, nextCtx, config, openSig)
  expect(out.state.open?.grade).toBe('B')
})
```

> Adapt `ctx`, `defaultConfig`, `simConfigFrom`, `initialSimState` imports to whatever the existing test file already sets up. Reuse its existing fixture context rather than inventing a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/forwardTest.test.ts`
Expected: FAIL — `advanceSim` still has the old 4-arg signature / ignores the passed signal.

- [ ] **Step 3: Write minimal implementation**

In `src/forwardTest.ts`, change `advanceSim` to accept the signal and drop the internal `evaluateSetup` call:

```ts
export function advanceSim(
  state: SimState,
  lastProcessedTime: number | null,
  ctx: MarketContext,
  config: Config,
  signal: SetupSignal,
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
  for (const candle of ctx.m5) {
    if (candle.time <= last) continue
    s = simStep(s, signal, simConfig, candle)
    last = candle.time
  }
  return { state: s, lastProcessedTime: last }
}
```

Remove the now-unused `evaluateSetup` import from `forwardTest.ts` ONLY if nothing else in the file uses it (keep `SetupVerdict`/`verdictToSignal`). Run typecheck to confirm.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/forwardTest.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/forwardTest.ts src/forwardTest.test.ts
git commit -m "refactor(sim): advanceSim takes an explicit signal (engine-agnostic)"
```

---

### Task 4: Second state in the sim blob

**Files:**
- Modify: `src/serverTick.ts` (`SimBlob` gains `claudeState` + `claudeLastProcessedTime`; `initBlob` initializes both).
- Test: `src/serverTick.test.ts` (assert `initBlob` seeds both accounts identically).

**Interfaces:**
- Produces: `SimBlob` now has `claudeState: SimState` and `claudeLastProcessedTime: number | null` alongside the existing `state` / `lastProcessedTime`.

- [ ] **Step 1: Write the failing test**

Add to `src/serverTick.test.ts`:

```ts
it('initBlob seeds Dad and Claude accounts identically (same economics)', () => {
  const simConfig = { startingBalance: 200, riskPct: 0.01, contractSize: 100 }
  const blob = initBlob(simConfig)
  expect(blob.claudeState.startingBalance).toBe(blob.state.startingBalance)
  expect(blob.claudeState.balance).toBe(blob.state.balance)
  expect(blob.claudeState.trades).toHaveLength(0)
  expect(blob.claudeLastProcessedTime).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/serverTick.test.ts`
Expected: FAIL — `claudeState` undefined on the blob.

- [ ] **Step 3: Write minimal implementation**

In `src/serverTick.ts`, extend the `SimBlob` type and `initBlob`:

```ts
export type SimBlob = {
  state: SimState
  lastProcessedTime: number | null
  claudeState: SimState
  claudeLastProcessedTime: number | null
  m15: Candle[]
  h1: Candle[]
  m15FetchedAt: number | null
  h1FetchedAt: number | null
  limitReachedAt: number | null
  updatedAt: number | null
}

export function initBlob(simConfig: SimConfig): SimBlob {
  return {
    state: initialSimState(simConfig),
    lastProcessedTime: null,
    claudeState: initialSimState(simConfig),
    claudeLastProcessedTime: null,
    m15: [],
    h1: [],
    m15FetchedAt: null,
    h1FetchedAt: null,
    limitReachedAt: null,
    updatedAt: null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/serverTick.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/serverTick.ts src/serverTick.test.ts
git commit -m "feat(sim): second (Claude) account in the sim blob"
```

---

### Task 5: `applyTick` advances both engines

**Files:**
- Modify: `src/serverTick.ts` (`applyTick` computes the Dad signal and the Claude signal from the same ctx + `now`, advances both states).
- Test: `src/serverTick.test.ts` (assert both watermarks advance on a tick).

**Interfaces:**
- Consumes: `evaluateSetup` + `verdictToSignal`, `evaluateSetupClaude` + `claudeVerdictToSignal`.
- Produces: `applyTick` signature unchanged (`(blob, fetched, config, now) => SimBlob`) but now advances `claudeState`/`claudeLastProcessedTime` too.

- [ ] **Step 1: Write the failing test**

Add to `src/serverTick.test.ts` (reuse the file's existing candle fixtures / helpers):

```ts
it('applyTick advances BOTH accounts from the same candles', () => {
  const simConfig = { startingBalance: 200, riskPct: 0.01, contractSize: 100 }
  const now = 1_000_000
  // First tick seeds both watermarks (no backfill), leaving them non-null.
  const seeded = applyTick(initBlob(simConfig), { m5: SAMPLE_M5, m15: SAMPLE_M15, h1: SAMPLE_H1 }, defaultConfig, now)
  expect(seeded.lastProcessedTime).not.toBeNull()
  expect(seeded.claudeLastProcessedTime).not.toBeNull()
  // Both watermarks track the same latest candle after seeding.
  expect(seeded.claudeLastProcessedTime).toBe(seeded.lastProcessedTime)
})
```

> Use whatever sample M5/M15/H1 fixtures `serverTick.test.ts` already defines; name them to match. If it builds them inline, mirror that.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/serverTick.test.ts`
Expected: FAIL — `claudeLastProcessedTime` stays null (not advanced).

- [ ] **Step 3: Write minimal implementation**

In `src/serverTick.ts`, add imports and advance both in `applyTick`:

```ts
import { evaluateSetup } from './scoring/evaluateSetup.js'
import { evaluateSetupClaude } from './scoring/evaluateSetupClaude.js'
import { advanceSim, verdictToSignal, claudeVerdictToSignal } from './forwardTest.js'
```

Replace the body of `applyTick` that currently calls `advanceSim(blob.state, blob.lastProcessedTime, ctx, config)`:

```ts
export function applyTick(
  blob: SimBlob,
  fetched: { m5: Candle[]; m15?: Candle[]; h1?: Candle[] },
  config: Config,
  now: number,
): SimBlob {
  const m15 = fetched.m15 ?? blob.m15
  const h1 = fetched.h1 ?? blob.h1
  const ctx: MarketContext = { m5: fetched.m5, m15, h1 }

  const dadSignal = verdictToSignal(evaluateSetup(ctx, config))
  const dad = advanceSim(blob.state, blob.lastProcessedTime, ctx, config, dadSignal)

  const claudeSignal = claudeVerdictToSignal(evaluateSetupClaude(ctx, config, now, []))
  const claude = advanceSim(blob.claudeState, blob.claudeLastProcessedTime, ctx, config, claudeSignal)

  return {
    ...blob,
    state: dad.state,
    lastProcessedTime: dad.lastProcessedTime,
    claudeState: claude.state,
    claudeLastProcessedTime: claude.lastProcessedTime,
    m15,
    h1,
    m15FetchedAt: fetched.m15 ? now : blob.m15FetchedAt,
    h1FetchedAt: fetched.h1 ? now : blob.h1FetchedAt,
    limitReachedAt: null,
    updatedAt: now,
  }
}
```

> Confirm the existing top-of-file imports (`Config`, `MarketContext`, `Candle`, `SimConfig`, `SimState`, `initialSimState`) remain; add only what's missing. Keep `advanceSim` imported from `./forwardTest.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/serverTick.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/serverTick.ts src/serverTick.test.ts
git commit -m "feat(sim): applyTick advances both Dad and Claude accounts per tick"
```

---

### Task 6: API — bump key to v2 and return both accounts

**Files:**
- Modify: `api/sim-tick.ts` (`KEY = 'sim:v2'`; response reports both trade counts).
- Modify: `api/sim-state.ts` (`KEY = 'sim:v2'`; return `claudeState` alongside `state`).

**Interfaces:**
- Produces: `/api/sim-state` JSON becomes `{ state, claudeState, meta }` (both are `SimState`). `/api/sim-tick` continues to return `{ ok, ... }`.
- Note: Vercel handlers aren't unit-tested in this repo; correctness is covered by the `serverTick` tests (Tasks 4–5) plus typecheck and the production build. There is no test step here — verify via `npm run typecheck` and `npm run build`.

- [ ] **Step 1: Edit `api/sim-tick.ts`**

Change the key constant:

```ts
const KEY = 'sim:v2'
```

Update the success response to report both accounts (optional but useful for the cron log):

```ts
    res.status(200).json({
      ok: true,
      dad: { trades: next.state.trades.length, balance: next.state.balance },
      claude: { trades: next.claudeState.trades.length, balance: next.claudeState.balance },
    })
```

- [ ] **Step 2: Edit `api/sim-state.ts`**

Change the key constant and include the Claude account in the payload:

```ts
const KEY = 'sim:v2'
```

```ts
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
  res.status(200).json({
    state: blob.state,
    claudeState: blob.claudeState,
    meta: { limitReachedAt: blob.limitReachedAt, updatedAt: blob.updatedAt },
  })
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: both clean (the API handlers compile; `blob.claudeState` exists after Task 4).

- [ ] **Step 4: Commit**

```bash
git add api/sim-tick.ts api/sim-state.ts
git commit -m "feat(api): sim v2 — advance and serve both Dad and Claude accounts"
```

---

### Task 7: `useServerSim` exposes both accounts

**Files:**
- Modify: `src/hooks/useServerSim.ts` (fetch and expose `claudeState` + `claudeStats`).
- Test: `src/hooks/useServerSim.test.ts` (extend the mock payload + assert Claude stats).

**Interfaces:**
- Produces: `UseServerSim` gains `claudeState: SimState` and `claudeStats: SimStats`. Existing `state`/`stats`/`meta`/`loading` unchanged.

- [ ] **Step 1: Write the failing test**

In `src/hooks/useServerSim.test.ts`, extend the mocked payload and assert Claude is derived. Update the `beforeEach` mock to include `claudeState`, and add an assertion:

```ts
const claudeServerState = {
  startingBalance: 10_000, balance: 9_900, open: null, armed: true, nextId: 1, trades: [],
}
// in beforeEach fetch mock, return: { state: serverState, claudeState: claudeServerState, meta: {...} }

it('derives Claude stats from claudeState', async () => {
  const { result } = renderHook(() => useServerSim())
  await waitFor(() => expect(result.current.claudeState.balance).toBe(9_900))
  expect(result.current.claudeStats.trades).toBe(0)
})
```

> Update the existing `beforeEach` mock object to add the `claudeState` key (keep `serverState` as-is for Dad). The existing two tests must still pass — when `claudeState` is absent from a payload (the failure test throws before json), fall back to an empty state (see impl).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useServerSim.test.ts`
Expected: FAIL — `claudeState`/`claudeStats` not on the hook result.

- [ ] **Step 3: Write minimal implementation**

Rewrite `src/hooks/useServerSim.ts` to track both states:

```ts
import { useEffect, useState } from 'react'
import { defaultConfig } from '../config'
import { simConfigFrom } from '../sim/config'
import { initialSimState } from '../sim/engine'
import { simStats, type SimStats } from '../sim/stats'
import type { SimState } from '../sim/types'

export type SimMeta = { limitReachedAt: number | null; updatedAt: number | null }
export type UseServerSim = {
  state: SimState
  stats: SimStats
  claudeState: SimState
  claudeStats: SimStats
  meta: SimMeta
  loading: boolean
}

const EMPTY_META: SimMeta = { limitReachedAt: null, updatedAt: null }

export function useServerSim(): UseServerSim {
  const initial = (): SimState => initialSimState(simConfigFrom(defaultConfig))
  const [state, setState] = useState<SimState>(initial)
  const [claudeState, setClaudeState] = useState<SimState>(initial)
  const [meta, setMeta] = useState<SimMeta>(EMPTY_META)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/sim-state')
        if (!res.ok) return
        const json = (await res.json()) as { state?: SimState; claudeState?: SimState; meta?: SimMeta }
        if (alive && json.state) {
          setState(json.state)
          if (json.claudeState) setClaudeState(json.claudeState)
          setMeta(json.meta ?? EMPTY_META)
        }
      } catch {
        // keep last-good
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    const id = setInterval(() => void load(), 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return { state, stats: simStats(state), claudeState, claudeStats: simStats(claudeState), meta, loading }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useServerSim.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useServerSim.ts src/hooks/useServerSim.test.ts
git commit -m "feat(hooks): useServerSim exposes the Claude account + stats"
```

---

### Task 8: Show the grade on Claude paper trades in `SimPanel`

**Files:**
- Modify: `src/ui/SimPanel.tsx` (render `t.grade` when present, on open position and in the trade rows).
- Test: `src/ui/SimPanel.test.tsx` (assert a graded trade shows its grade; an ungraded one does not).

**Interfaces:**
- No prop changes — `SimPanel` already takes `{ state, stats, meta }`. It renders the grade only when a position/trade carries one (Dad trades have none, so Dad is visually unchanged).

- [ ] **Step 1: Write the failing test**

Add to `src/ui/SimPanel.test.tsx` (reuse its existing state/stats/meta fixtures; add a graded trade):

```ts
it('shows the grade chip on a graded trade', () => {
  const graded = {
    id: 't9', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2,
    openedAtTime: 0, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 4, closedAtTime: 1,
    grade: 'A',
  } as const
  const state = { startingBalance: 200, balance: 204, open: null, armed: true, nextId: 10, trades: [graded] }
  render(<SimPanel state={state} stats={simStats(state)} meta={{ limitReachedAt: null, updatedAt: 1 }} />)
  expect(screen.getByText('A')).toBeInTheDocument()
})
```

> Import `simStats` from `../sim/stats` and `SimPanel` per the existing test file's imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/SimPanel.test.tsx`
Expected: FAIL — no grade rendered.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/SimPanel.tsx`, in the trade-row header (where direction + entry/SL/TP render), add a grade chip when present. Inside the `.map((t) => ...)` header row, after the direction span:

```tsx
{t.grade && (
  <span className="rounded-chip border border-brand/50 bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand" aria-label={`grade ${t.grade}`}>
    {t.grade}
  </span>
)}
```

And on the open-position line, after the direction span, the same chip using `state.open.grade`:

```tsx
{state.open.grade && (
  <span className="rounded-chip border border-brand/50 bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
    {state.open.grade}
  </span>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/SimPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SimPanel.tsx src/ui/SimPanel.test.tsx
git commit -m "feat(ui): SimPanel shows the pre-trade grade on graded trades"
```

---

### Task 9: Paper tab — two accounts side-by-side

**Files:**
- Modify: `src/App.tsx` (Paper tab renders Dad + Claude `SimPanel`s inside `StrategySection`s).
- Test: `src/App.test.tsx` (assert both engine labels appear on the Paper tab).

**Interfaces:**
- Consumes: `useServerSim` (now returns `claudeState`/`claudeStats`), `StrategySection`, `SimPanel`.

- [ ] **Step 1: Write the failing test**

Add to `src/App.test.tsx` a Paper-tab test. Follow the file's existing pattern for switching tabs (find how other tabs are activated — likely a `getByRole('tab', { name: /paper/i })` click). Example:

```tsx
import { fireEvent } from '@testing-library/react'

it('shows both engine accounts on the Paper tab', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('tab', { name: /paper/i }))
  // Two StrategySection headings (Dad + ChatGPT, Claude) now bracket the two SimPanels.
  expect(screen.getByRole('heading', { name: /dad \+ chatgpt/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /claude/i })).toBeInTheDocument()
})
```

> If the existing test harness renders in `live` mode (the Paper tab only shows panels in live mode), match that. If it renders in demo mode, the Paper tab shows the "switch to Live" message instead — in that case set up live mode as the other live-dependent tests do. Inspect the current `App.test.tsx` to follow its established mode setup.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — only one panel / no StrategySection headings on Paper.

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, replace the `tab === 'paper'` live branch (currently a single `<SimPanel .../>`) with two sectioned panels:

```tsx
{tab === 'paper' &&
  (mode === 'live' ? (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <StrategySection engine="dad" subtitle="verbatim 13-step">
        <SimPanel state={sim.state} stats={sim.stats} meta={sim.meta} />
      </StrategySection>
      <StrategySection engine="claude" subtitle="my criteria">
        <SimPanel state={sim.claudeState} stats={sim.claudeStats} meta={sim.meta} />
      </StrategySection>
    </div>
  ) : (
    <div className="rounded-panel border border-border bg-surface px-[18px] py-8 text-center text-[12.5px] text-ink-2 shadow-panel">
      Paper trading records the shared <b className="text-ink">Live</b> forward-test. Switch to Live
      to view it.
    </div>
  ))}
```

> `SimPanel` has an `mt-4` on its root `<section>`. Inside a `StrategySection` that may double the top gap; if it looks off, that's a cosmetic follow-up, not a blocker for this task. Do not change `SimPanel`'s margin as part of this task unless a test requires it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS. Then the full gate: `npm run typecheck && npx vitest run && npm run lint && npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(ui): Paper tab — Dad vs Claude accounts side-by-side"
```

---

## Self-Review

**Spec coverage (Phase 2 scope):**
- Parallel paper forward-test, second account, identical economics → Tasks 1–5 (blob second state, applyTick both, same SimConfig). ✓
- Server tick advances both → Task 5. ✓
- Dual histories in the UI → Tasks 7, 9. ✓
- Per-trade grade tagging → Tasks 1, 2, 8. ✓
- `/api/sim-state` returns both; hook exposes both → Tasks 6, 7. ✓
- Fair start / reset together (v2 key) → Tasks 4, 6 + Global Constraints. ✓
- Chart markers → explicitly deferred (documented in Global Constraints + PR), NOT silently cut. ✓
- By-grade analytics view → Phase 3 (grade tagging groundwork done here). ✓

**Placeholder scan:** No TBD/TODO. The `>` notes are verification instructions against existing test files (reuse their fixtures/mode setup) — each names the exact file to inspect.

**Type consistency:** `SetupSignal.grade`, `SimPosition.grade`, `SimTrade.grade` all use the `Grade` type from `edge/scoreSetup`. `claudeVerdictToSignal` returns `SetupSignal` (Task 2) consumed by `applyTick` (Task 5). `advanceSim`'s new 5-arg signature (Task 3) is used consistently in Task 5 and the updated tests. `SimBlob.claudeState`/`claudeLastProcessedTime` (Task 4) are read in `applyTick` (Task 5), `api/sim-state` (Task 6), and surfaced by `useServerSim` (Task 7). `UseServerSim.claudeState`/`claudeStats` (Task 7) are consumed in the Paper tab (Task 9).

## Notes for the executor
- Redis key bump to `sim:v2` is intentional — it starts both accounts clean and simultaneous. The live cron hitting `/api/sim-tick` will initialize `sim:v2` on its next run; no manual migration.
- Keep NodeNext `.js` import suffixes. Run one-shot: `npx vitest run` / `npm run test:run`.
- Final gate before PR: `npm run typecheck && npm run test:run && npm run lint && npm run build` all green.
