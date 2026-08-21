# Paper Trading Forward-Test (Phase A.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client-only live forward-test that paper-trades the engine's authorized setups with credits, tracking balance + win-rate, saved to the device.

**Architecture:** A pure, deterministic sim reducer (`src/sim/`) that imports only `../types`; a driving hook (`src/hooks/useSim.ts`) that adapts the engine's `SetupVerdict` into a narrow `SetupSignal`, steps once per new candle, and persists to localStorage; and a prop-driven `SimPanel`. The pure core is written so the future 24/7 server cron reuses it unchanged.

**Tech Stack:** React 18 + Vite + TypeScript (strict, `noUncheckedIndexedAccess`) + Tailwind + Vitest (jsdom).

## Global Constraints

- Import direction is downward only: `ui → hooks → sim → scoring → gates → indicators → types`. **`src/sim` imports only `../types`** (never `scoring`); the hook adapts `SetupVerdict → SetupSignal`.
- The sim core is **pure and deterministic**: no `Date.now()`, no `Math.random()`, no I/O. Ids come from a `nextId` counter; times come from `candle.time`.
- **Exit rule:** full position closes at **TP2 (2R)** or **SL**. If one candle touches both, count the **stop** (`loss`) — never inflate the win-rate.
- **One open position at a time.** After a close, do not reopen until the engine returns to WAIT (`armed` flag).
- **Records Live-mode trades only** (demo never records).
- **localStorage key:** `northmark-sim-v1`. Loading corrupt/absent storage falls back to a fresh state, never throws.
- **Honesty:** the panel shows a "PAPER · credits, not real money" label; win-rate is shown alongside Avg R; a Reset control exists; **no buy/order/execute affordance**.
- ESLint guard: any `<svg fill="none">` must also set a stroke color (not expected in this feature's code, but keep `npx eslint .` clean).
- Commands: `npm run typecheck`, `npx eslint .`, `npm run test:run`, `npm run build`. Run a single file with `npm run test:run -- <path>`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- Create `src/sim/types.ts` — sim domain types (SimConfig, SimPosition, SimTrade, SimState).
- Create `src/sim/config.ts` — `SIM_STARTING_BALANCE` + `simConfigFrom(config)`.
- Create `src/sim/engine.ts` — `SetupSignal`, `initialSimState`, `simStep` (settle + maybe-open).
- Create `src/sim/stats.ts` — `SimStats` + `simStats(state)`.
- Create `src/hooks/useSim.ts` — drives the reducer from live data; localStorage; candle-time dedup.
- Create `src/ui/SimPanel.tsx` — the paper-trading panel.
- Modify `src/App.tsx` — call `useSim`, render `<SimPanel>` in Live mode.

---

## Task 1: Sim core — types, config, and the pure reducer

**Files:**
- Create: `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/engine.ts`
- Test: `src/sim/engine.test.ts`

**Interfaces:**
- Produces: `SimConfig`, `SimPosition`, `SimTrade`, `SimState` (types.ts); `SIM_STARTING_BALANCE`, `simConfigFrom(config: Config): SimConfig` (config.ts); `SetupSignal`, `initialSimState(config: SimConfig): SimState`, `simStep(state: SimState, signal: SetupSignal, config: SimConfig, latest: Candle): SimState` (engine.ts).
- Consumes: `Candle`, `Direction`, `Config` from `src/types.ts`.

- [ ] **Step 1: Write the types**

```ts
// src/sim/types.ts
import type { Direction } from '../types'

export type SimConfig = { startingBalance: number; riskPct: number }

export type SimPosition = {
  id: string
  direction: Direction
  entry: number
  sl: number
  tp: number            // TP2 (the 2R target)
  riskCredits: number   // credits at risk = balance * riskPct at open
  rr: number            // reward:risk to tp (≈2) — drives win P&L
  openedAtTime: number  // candle time (epoch ms) at open
}

export type SimTrade = SimPosition & {
  exit: number
  exitReason: 'tp' | 'sl'
  result: 'win' | 'loss'
  rMultiple: number     // +rr on a win, -1 on a loss
  pnlCredits: number    // riskCredits * rMultiple
  closedAtTime: number
}

export type SimState = {
  startingBalance: number
  balance: number
  open: SimPosition | null
  armed: boolean        // may open on the next authorization? false after a close until WAIT
  trades: SimTrade[]
  nextId: number        // monotonic id source (no Date.now / Math.random)
}
```

- [ ] **Step 2: Write the config helper**

```ts
// src/sim/config.ts
import type { Config } from '../types'
import type { SimConfig } from './types'

/** Starting paper balance in credits. */
export const SIM_STARTING_BALANCE = 10_000

/** Derive the sim config from the main engine config — risk mirrors the live risk %. */
export function simConfigFrom(config: Config): SimConfig {
  return { startingBalance: SIM_STARTING_BALANCE, riskPct: config.riskPct }
}
```

- [ ] **Step 3: Write the failing engine test**

```ts
// src/sim/engine.test.ts
import { describe, expect, it } from 'vitest'
import { initialSimState, simStep, type SetupSignal } from './engine'
import type { SimConfig } from './types'
import type { Candle } from '../types'

const config: SimConfig = { startingBalance: 10_000, riskPct: 0.01 }
const candle = (time: number, high: number, low: number): Candle => ({
  time, open: (high + low) / 2, high, low, close: (high + low) / 2,
})
// risk 5, reward 10 → rr 2
const longSig: SetupSignal = { authorized: true, direction: 'long', entry: 100, sl: 95, tp: 110 }
const shortSig: SetupSignal = { authorized: true, direction: 'short', entry: 100, sl: 105, tp: 90 }
const wait: SetupSignal = { authorized: false }

describe('sim engine', () => {
  it('starts flat and armed with the full balance', () => {
    expect(initialSimState(config)).toEqual({
      startingBalance: 10_000, balance: 10_000, open: null, armed: true, trades: [], nextId: 1,
    })
  })

  it('opens one long position on an authorized setup (1% risk)', () => {
    const s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    expect(s.open).toMatchObject({ direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 100, rr: 2 })
    expect(s.armed).toBe(false)
    expect(s.nextId).toBe(2)
  })

  it('does not open a second position while one is open', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    s = simStep(s, longSig, config, candle(2, 101, 99)) // no TP/SL touch
    expect(s.trades).toHaveLength(0)
    expect(s.open?.id).toBe('t1')
  })

  it('closes a long as a WIN when the high reaches TP (+2R = +200 credits)', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    s = simStep(s, longSig, config, candle(2, 110, 108))
    expect(s.trades[0]).toMatchObject({ result: 'win', exitReason: 'tp', rMultiple: 2, pnlCredits: 200, exit: 110 })
    expect(s.balance).toBe(10_200)
    expect(s.open).toBeNull()
  })

  it('closes a long as a LOSS when the low reaches SL (-1R = -100 credits)', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    s = simStep(s, longSig, config, candle(2, 96, 94))
    expect(s.trades[0]).toMatchObject({ result: 'loss', exitReason: 'sl', rMultiple: -1, pnlCredits: -100, exit: 95 })
    expect(s.balance).toBe(9_900)
  })

  it('counts the STOP when one candle touches both TP and SL', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99))
    s = simStep(s, longSig, config, candle(2, 111, 94))
    expect(s.trades[0]).toMatchObject({ result: 'loss', exitReason: 'sl' })
  })

  it('mirrors for a short (TP at low, SL at high)', () => {
    let win = simStep(initialSimState(config), shortSig, config, candle(1, 101, 99))
    win = simStep(win, shortSig, config, candle(2, 92, 90))
    expect(win.trades[0]).toMatchObject({ direction: 'short', result: 'win', rMultiple: 2 })
    let loss = simStep(initialSimState(config), shortSig, config, candle(1, 101, 99))
    loss = simStep(loss, shortSig, config, candle(2, 106, 104))
    expect(loss.trades[0]).toMatchObject({ result: 'loss', rMultiple: -1 })
  })

  it('will not re-open the same setup until the engine returns to WAIT', () => {
    let s = simStep(initialSimState(config), longSig, config, candle(1, 101, 99)) // open t1
    s = simStep(s, longSig, config, candle(2, 110, 108)) // win, closes; armed=false
    s = simStep(s, longSig, config, candle(3, 101, 99)) // still authorized but not armed → no open
    expect(s.open).toBeNull()
    expect(s.trades).toHaveLength(1)
    s = simStep(s, wait, config, candle(4, 101, 99)) // WAIT re-arms
    expect(s.armed).toBe(true)
    s = simStep(s, longSig, config, candle(5, 101, 99)) // fresh authorization opens t2
    expect(s.open?.id).toBe('t2')
  })

  it('does not open on WAIT — it just arms', () => {
    const s = simStep(initialSimState(config), wait, config, candle(1, 101, 99))
    expect(s.open).toBeNull()
    expect(s.armed).toBe(true)
  })

  it('guards against a zero-risk signal (entry === sl)', () => {
    const bad: SetupSignal = { authorized: true, direction: 'long', entry: 100, sl: 100, tp: 110 }
    const s = simStep(initialSimState(config), bad, config, candle(1, 101, 99))
    expect(s.open).toBeNull()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:run -- src/sim/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 5: Write the engine**

```ts
// src/sim/engine.ts
import type { Candle, Direction } from '../types'
import type { SimConfig, SimPosition, SimState, SimTrade } from './types'

export type SetupSignal =
  | { authorized: true; direction: Direction; entry: number; sl: number; tp: number }
  | { authorized: false }

export function initialSimState(config: SimConfig): SimState {
  return {
    startingBalance: config.startingBalance,
    balance: config.startingBalance,
    open: null,
    armed: true,
    trades: [],
    nextId: 1,
  }
}

/** Close the open position against the latest candle. SL-first if both are touched. */
function settle(state: SimState, candle: Candle): SimState {
  const pos = state.open
  if (!pos) return state
  const isLong = pos.direction === 'long'
  const hitSl = isLong ? candle.low <= pos.sl : candle.high >= pos.sl
  const hitTp = isLong ? candle.high >= pos.tp : candle.low <= pos.tp
  if (!hitSl && !hitTp) return state
  const exitReason: 'tp' | 'sl' = hitSl ? 'sl' : 'tp'
  const result: 'win' | 'loss' = exitReason === 'tp' ? 'win' : 'loss'
  const exit = exitReason === 'tp' ? pos.tp : pos.sl
  const rMultiple = exitReason === 'tp' ? pos.rr : -1
  const pnlCredits = pos.riskCredits * rMultiple
  const trade: SimTrade = { ...pos, exit, exitReason, result, rMultiple, pnlCredits, closedAtTime: candle.time }
  return {
    ...state,
    balance: state.balance + pnlCredits,
    open: null,
    armed: false,
    trades: [...state.trades, trade],
  }
}

/** Open a position when armed, flat, and a setup is authorized. */
function maybeOpen(state: SimState, signal: SetupSignal, config: SimConfig, candle: Candle): SimState {
  if (!signal.authorized) {
    return state.armed ? state : { ...state, armed: true } // returned to WAIT → re-arm
  }
  if (state.open !== null || !state.armed) return state
  const riskDist = Math.abs(signal.entry - signal.sl)
  const rewardDist = Math.abs(signal.tp - signal.entry)
  const riskCredits = state.balance * config.riskPct
  // Guard a degenerate setup / config that would size a bad position.
  if (!(riskDist > 0) || !(riskCredits > 0) || !Number.isFinite(riskCredits)) return state
  const pos: SimPosition = {
    id: `t${state.nextId}`,
    direction: signal.direction,
    entry: signal.entry,
    sl: signal.sl,
    tp: signal.tp,
    riskCredits,
    rr: rewardDist / riskDist,
    openedAtTime: candle.time,
  }
  return { ...state, open: pos, armed: false, nextId: state.nextId + 1 }
}

/** One tick: settle the open position against `latest`, then maybe open a new one. */
export function simStep(state: SimState, signal: SetupSignal, config: SimConfig, latest: Candle): SimState {
  return maybeOpen(settle(state, latest), signal, config, latest)
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:run -- src/sim/engine.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck && npx eslint src/sim
git add src/sim/types.ts src/sim/config.ts src/sim/engine.ts src/sim/engine.test.ts
git commit -m "feat(sim): pure paper-trading reducer (open/settle/simStep)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Sim stats

**Files:**
- Create: `src/sim/stats.ts`
- Test: `src/sim/stats.test.ts`

**Interfaces:**
- Consumes: `SimState`, `SimTrade` from `src/sim/types.ts`.
- Produces: `SimStats`, `simStats(state: SimState): SimStats`.

- [ ] **Step 1: Write the failing test**

```ts
// src/sim/stats.test.ts
import { describe, expect, it } from 'vitest'
import { simStats } from './stats'
import type { SimState, SimTrade } from './types'

const trade = (result: 'win' | 'loss', rMultiple: number, pnlCredits: number): SimTrade => ({
  id: 't', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 100, rr: 2,
  openedAtTime: 0, exit: result === 'win' ? 110 : 95, exitReason: result === 'win' ? 'tp' : 'sl',
  result, rMultiple, pnlCredits, closedAtTime: 1,
})

describe('simStats', () => {
  it('is all zeros for a fresh state', () => {
    const s: SimState = { startingBalance: 10_000, balance: 10_000, open: null, armed: true, trades: [], nextId: 1 }
    expect(simStats(s)).toEqual({ trades: 0, wins: 0, losses: 0, winRate: 0, avgR: 0, pnlCredits: 0, returnPct: 0 })
  })

  it('computes win-rate, avg R, pnl and return %', () => {
    const s: SimState = {
      startingBalance: 10_000, balance: 10_300, open: null, armed: true, nextId: 4,
      trades: [trade('win', 2, 200), trade('win', 2, 200), trade('loss', -1, -100)],
    }
    const r = simStats(s)
    expect(r).toMatchObject({ trades: 3, wins: 2, losses: 1, pnlCredits: 300 })
    expect(r.winRate).toBeCloseTo(2 / 3, 6)
    expect(r.avgR).toBeCloseTo((2 + 2 - 1) / 3, 6)
    expect(r.returnPct).toBeCloseTo(3, 6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/sim/stats.test.ts`
Expected: FAIL — `Cannot find module './stats'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/sim/stats.ts
import type { SimState } from './types'

export type SimStats = {
  trades: number
  wins: number
  losses: number
  winRate: number      // wins / trades, 0 when no trades
  avgR: number         // mean rMultiple, 0 when no trades
  pnlCredits: number   // balance − startingBalance
  returnPct: number    // pnlCredits / startingBalance * 100
}

export function simStats(state: SimState): SimStats {
  const trades = state.trades.length
  const wins = state.trades.filter((t) => t.result === 'win').length
  const losses = trades - wins
  const winRate = trades > 0 ? wins / trades : 0
  const avgR = trades > 0 ? state.trades.reduce((sum, t) => sum + t.rMultiple, 0) / trades : 0
  const pnlCredits = state.balance - state.startingBalance
  const returnPct = state.startingBalance > 0 ? (pnlCredits / state.startingBalance) * 100 : 0
  return { trades, wins, losses, winRate, avgR, pnlCredits, returnPct }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/sim/stats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npx eslint src/sim
git add src/sim/stats.ts src/sim/stats.test.ts
git commit -m "feat(sim): win-rate / avg-R / return stats

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: useSim hook (drives the reducer from live data + persistence)

**Files:**
- Create: `src/hooks/useSim.ts`
- Test: `src/hooks/useSim.test.ts`

**Interfaces:**
- Consumes: `initialSimState`, `simStep`, `SetupSignal` (engine); `simStats`, `SimStats` (stats); `simConfigFrom` (config); `SimState` (types); `SetupVerdict` from `src/scoring/evaluateSetup.ts`; `Config`, `MarketContext` from `src/types.ts`.
- Produces: `useSim(ctx: MarketContext | null, verdict: SetupVerdict, enabled: boolean, config: Config): { state: SimState; stats: SimStats; reset: () => void }` (type `UseSim`).

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useSim.test.ts
import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSim } from './useSim'
import { defaultConfig } from '../config'
import type { Candle, MarketContext } from '../types'
import type { SetupVerdict } from '../scoring/evaluateSetup'

const candle = (time: number, high: number, low: number): Candle => ({
  time, open: (high + low) / 2, high, low, close: (high + low) / 2,
})
const ctxAt = (c: Candle): MarketContext => ({ m5: [c], m15: [c], h1: [c] })
const setup = (): SetupVerdict => ({
  status: 'setup', direction: 'long', level: 95, entry: 100, sl: 95, tp1: 105, tp2: 110, lot: 0.1,
  gates: [], supporting: [], vetoes: [], score: { passed: 7, band: 'strong', authorized: true },
})
const wait = (): SetupVerdict => ({
  status: 'wait', blockedBy: 'h1-m15-bias', direction: null,
  gates: [], supporting: [], vetoes: [], score: { passed: 0, band: 'wait', authorized: false },
})

beforeEach(() => localStorage.clear())

describe('useSim', () => {
  it('opens a paper trade on a new candle when a setup is authorized (live)', () => {
    const { result } = renderHook(() => useSim(ctxAt(candle(1, 101, 99)), setup(), true, defaultConfig))
    expect(result.current.state.open?.id).toBe('t1')
  })

  it('does not step when disabled (demo mode)', () => {
    const { result } = renderHook(() => useSim(ctxAt(candle(1, 101, 99)), setup(), false, defaultConfig))
    expect(result.current.state.open).toBeNull()
  })

  it('steps once per new candle time, not on every re-render', () => {
    const { result, rerender } = renderHook(
      ({ ctx }) => useSim(ctx, setup(), true, defaultConfig),
      { initialProps: { ctx: ctxAt(candle(1, 101, 99)) } },
    )
    expect(result.current.state.nextId).toBe(2) // t1 opened
    rerender({ ctx: ctxAt(candle(1, 101, 99)) }) // same candle time, new object
    expect(result.current.state.nextId).toBe(2) // no second open
  })

  it('persists to localStorage and a fresh hook reloads the open position', () => {
    const { unmount } = renderHook(() => useSim(ctxAt(candle(1, 101, 99)), setup(), true, defaultConfig))
    unmount()
    expect(localStorage.getItem('northmark-sim-v1')).toContain('"open"')
    const { result } = renderHook(() => useSim(null, wait(), true, defaultConfig))
    expect(result.current.state.open).not.toBeNull()
  })

  it('reset clears trades and the open position', () => {
    const { result } = renderHook(() => useSim(ctxAt(candle(1, 101, 99)), setup(), true, defaultConfig))
    act(() => result.current.reset())
    expect(result.current.state.open).toBeNull()
    expect(result.current.state.trades).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/hooks/useSim.test.ts`
Expected: FAIL — `Cannot find module './useSim'`.

- [ ] **Step 3: Write the hook**

```ts
// src/hooks/useSim.ts
import { useEffect, useRef, useState } from 'react'
import type { Config, MarketContext } from '../types'
import type { SetupVerdict } from '../scoring/evaluateSetup'
import { initialSimState, simStep, type SetupSignal } from '../sim/engine'
import { simStats, type SimStats } from '../sim/stats'
import { simConfigFrom } from '../sim/config'
import type { SimConfig, SimState } from '../sim/types'

const STORAGE_KEY = 'northmark-sim-v1'

/** Load persisted sim state; fall back to a fresh state on missing/corrupt storage. */
function loadState(simConfig: SimConfig): SimState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SimState
      if (typeof parsed?.balance === 'number' && Array.isArray(parsed?.trades)) return parsed
    }
  } catch {
    // ignore corrupt storage
  }
  return initialSimState(simConfig)
}

function save(state: SimState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota/serialization errors
  }
}

function toSignal(verdict: SetupVerdict): SetupSignal {
  if (verdict.status === 'setup') {
    return { authorized: true, direction: verdict.direction, entry: verdict.entry, sl: verdict.sl, tp: verdict.tp2 }
  }
  return { authorized: false }
}

export type UseSim = { state: SimState; stats: SimStats; reset: () => void }

/**
 * Drives the pure sim reducer from live market data. Steps at most once per new M5 candle
 * (guarded by the latest candle time), only when `enabled` (Live mode) — demo never records.
 * Persists to localStorage. The impure boundary (storage) lives here, not in src/sim.
 */
export function useSim(
  ctx: MarketContext | null,
  verdict: SetupVerdict,
  enabled: boolean,
  config: Config,
): UseSim {
  const simConfig = simConfigFrom(config)
  const [state, setState] = useState<SimState>(() => loadState(simConfig))
  const lastProcessed = useRef<number | null>(null)

  // Step at most once per new candle, Live mode only.
  useEffect(() => {
    if (!enabled || !ctx) return
    const latest = ctx.m5[ctx.m5.length - 1]
    if (!latest || lastProcessed.current === latest.time) return
    lastProcessed.current = latest.time
    setState((prev) => simStep(prev, toSignal(verdict), simConfig, latest))
    // The candle-time guard is the real trigger; verdict/simConfig are read fresh from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, enabled])

  // Persist whenever the sim state changes.
  useEffect(() => {
    save(state)
  }, [state])

  const reset = (): void => {
    lastProcessed.current = null
    setState(initialSimState(simConfig))
  }

  return { state, stats: simStats(state), reset }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/hooks/useSim.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck && npx eslint src/hooks/useSim.ts
git add src/hooks/useSim.ts src/hooks/useSim.test.ts
git commit -m "feat(sim): useSim hook — drives the reducer from live data, persists

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: SimPanel UI

**Files:**
- Create: `src/ui/SimPanel.tsx`
- Test: `src/ui/SimPanel.test.tsx`

**Interfaces:**
- Consumes: `SimState` from `src/sim/types.ts`; `SimStats` from `src/sim/stats.ts`; `StatusIcon` from `src/ui/status.tsx`.
- Produces: `SimPanel({ state, stats, onReset }: { state: SimState; stats: SimStats; onReset: () => void }): ReactElement`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/SimPanel.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { SimPanel } from './SimPanel'
import { simStats } from '../sim/stats'
import type { SimState } from '../sim/types'

const empty: SimState = { startingBalance: 10_000, balance: 10_000, open: null, armed: true, trades: [], nextId: 1 }

const win = (id: string): SimState['trades'][number] => ({
  id, direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 100, rr: 2,
  openedAtTime: 0, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 200, closedAtTime: 1,
})
const loss = (id: string): SimState['trades'][number] => ({
  id, direction: 'short', entry: 100, sl: 105, tp: 90, riskCredits: 100, rr: 2,
  openedAtTime: 0, exit: 105, exitReason: 'sl', result: 'loss', rMultiple: -1, pnlCredits: -100, closedAtTime: 1,
})

test('renders the PAPER label and an empty state before any trades', () => {
  render(<SimPanel state={empty} stats={simStats(empty)} onReset={vi.fn()} />)
  expect(screen.getByText(/credits, not real money/i)).toBeInTheDocument()
  expect(screen.getByText(/No paper trades yet/i)).toBeInTheDocument()
})

test('renders balance, win-rate and record once there are trades', () => {
  const state: SimState = { startingBalance: 10_000, balance: 10_300, open: null, armed: true, nextId: 4, trades: [win('t1'), win('t2'), loss('t3')] }
  render(<SimPanel state={state} stats={simStats(state)} onReset={vi.fn()} />)
  expect(screen.getByText('10,300')).toBeInTheDocument()
  expect(screen.getByText('67%')).toBeInTheDocument()
  expect(screen.getByText('2-1')).toBeInTheDocument()
})

test('calls onReset when Reset is clicked', () => {
  const onReset = vi.fn()
  render(<SimPanel state={empty} stats={simStats(empty)} onReset={onReset} />)
  fireEvent.click(screen.getByText('Reset'))
  expect(onReset).toHaveBeenCalled()
})

test('renders no buy/order/execute affordance', () => {
  render(<SimPanel state={empty} stats={simStats(empty)} onReset={vi.fn()} />)
  expect(screen.queryByRole('button', { name: /buy|order|execute|place/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/ui/SimPanel.test.tsx`
Expected: FAIL — `Cannot find module './SimPanel'`.

- [ ] **Step 3: Write the component**

```tsx
// src/ui/SimPanel.tsx
import type { ReactElement } from 'react'
import type { SimState } from '../sim/types'
import type { SimStats } from '../sim/stats'
import { StatusIcon } from './status'

function credits(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }): ReactElement {
  const color = tone === 'up' ? 'text-pass-fg' : tone === 'down' ? 'text-fail-fg' : 'text-ink'
  return (
    <div className="bg-surface-raised px-[13px] py-3">
      <div className="mb-[5px] text-[10.5px] uppercase tracking-[0.07em] text-ink-3">{label}</div>
      <div className={`font-mono text-[17px] font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

/**
 * The paper-trading panel: a running credit balance + win-rate + record + avg R over the
 * forward-test, the open position (if any), and recent trades. Win-rate sits next to Avg R so
 * the number is read honestly. Read-only apart from Reset — no buy/order/execute control.
 */
export function SimPanel({ state, stats, onReset }: { state: SimState; stats: SimStats; onReset: () => void }): ReactElement {
  const up = stats.pnlCredits >= 0
  const rSign = stats.avgR >= 0 ? '+' : '−'
  return (
    <section className="mt-4 rounded-panel border border-border bg-surface shadow-panel" aria-label="Paper trading">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-[18px] py-[15px] pb-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">Paper Trading</h2>
          <span className="rounded-chip border border-build-bd bg-build-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-build-fg">
            Paper · credits, not real money
          </span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] font-semibold text-ink-3 underline underline-offset-2 hover:text-ink"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Balance" value={credits(state.balance)} />
        <Stat label="Win rate" value={stats.trades > 0 ? `${(stats.winRate * 100).toFixed(0)}%` : '—'} />
        <Stat label="Record (W-L)" value={`${stats.wins}-${stats.losses}`} />
        <Stat
          label="Avg R"
          value={stats.trades > 0 ? `${rSign}${Math.abs(stats.avgR).toFixed(2)}R` : '—'}
          tone={stats.trades > 0 ? (stats.avgR >= 0 ? 'up' : 'down') : undefined}
        />
        <Stat
          label="Return"
          value={stats.trades > 0 ? `${signed(Math.round(stats.pnlCredits))} (${up ? '+' : '−'}${Math.abs(stats.returnPct).toFixed(1)}%)` : '—'}
          tone={stats.trades > 0 ? (up ? 'up' : 'down') : undefined}
        />
      </div>

      {state.open && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-[18px] py-3 text-[12.5px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Open</span>
          <span className={`font-semibold ${state.open.direction === 'long' ? 'text-pass-fg' : 'text-fail-fg'}`}>
            {state.open.direction === 'long' ? '▲ LONG' : '▼ SHORT'}
          </span>
          <span className="font-mono text-ink-2">
            entry {state.open.entry} · SL {state.open.sl} · TP {state.open.tp}
          </span>
        </div>
      )}

      <div className="px-[14px] py-2 pb-[14px]">
        {state.trades.length === 0 ? (
          <p className="m-0 px-1.5 py-3 text-[12.5px] text-ink-2">
            No paper trades yet. When a setup authorizes in Live mode, Northmark opens one
            automatically.
          </p>
        ) : (
          [...state.trades]
            .slice(-8)
            .reverse()
            .map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-1.5 py-2 last:border-b-0"
              >
                <StatusIcon status={t.result === 'win' ? 'pass' : 'fail'} size={20} />
                <span className="font-mono text-[12.5px] text-ink-2">
                  {t.direction === 'long' ? 'LONG' : 'SHORT'} · {t.exitReason.toUpperCase()} @ {t.exit}
                </span>
                <span
                  className={`font-mono text-[12.5px] font-semibold tabular-nums ${
                    t.result === 'win' ? 'text-pass-fg' : 'text-fail-fg'
                  }`}
                >
                  {t.rMultiple >= 0 ? '+' : '−'}
                  {Math.abs(t.rMultiple).toFixed(0)}R · {signed(Math.round(t.pnlCredits))}
                </span>
              </div>
            ))
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/ui/SimPanel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
npm run typecheck && npx eslint .
git add src/ui/SimPanel.tsx src/ui/SimPanel.test.tsx
git commit -m "feat(sim): SimPanel — balance / win-rate / record / trades

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire the sim into App (Live mode)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useSim` (hook), `SimPanel` (ui), `SetupVerdict` (already imported in App).

- [ ] **Step 1: Add the imports**

Add near the other hook/ui imports at the top of `src/App.tsx`:

```tsx
import { useSim } from './hooks/useSim'
import { SimPanel } from './ui/SimPanel'
```

- [ ] **Step 2: Add a loading-placeholder verdict constant**

Add at module scope (near the top, after imports), used only to feed the hook before live data arrives:

```tsx
/** A neutral verdict for the moment before live candles load — the sim ignores it (ctx is null). */
const LOADING_VERDICT: SetupVerdict = {
  status: 'wait',
  blockedBy: 'loading',
  direction: null,
  gates: [],
  supporting: [],
  vetoes: [],
  score: { passed: 0, band: 'wait', authorized: false },
}
```

- [ ] **Step 3: Compute the verdict and drive the sim ABOVE the loading early-return**

In `App()`, the code currently reads (around the `activeConfig` line, then an early return for missing live data):

```tsx
  const demoPreset = mode === 'live' ? null : DEMO_PRESETS.find((p) => p.id === mode) ?? null
  const activeCtx = demoPreset ? demoPreset.ctx : ctx
  const activeConfig = demoPreset?.config ?? config

  if (mode === 'live' && !activeCtx) {
```

Insert the verdict + sim hook BETWEEN `activeConfig` and the `if (mode === 'live' && !activeCtx)` guard (hooks must run unconditionally, before any early return):

```tsx
  const activeConfig = demoPreset?.config ?? config

  // Compute the verdict once (null while live data loads) and drive the paper-trading sim.
  // useSim must run on every render, so it sits above the loading early-return below.
  const verdict = activeCtx ? evaluateSetup(activeCtx, activeConfig) : null
  const sim = useSim(activeCtx, verdict ?? LOADING_VERDICT, mode === 'live', activeConfig)

  if (mode === 'live' && !activeCtx) {
```

- [ ] **Step 4: Reuse the computed verdict in the main render (no double eval)**

Further down, the code currently recomputes the verdict:

```tsx
  const ctxForRender = activeCtx as MarketContext
  const result = evaluateSetup(ctxForRender, activeConfig)
```

Change the second line to reuse the already-computed `verdict` (it is non-null past the guard):

```tsx
  const ctxForRender = activeCtx as MarketContext
  const result = verdict as SetupVerdict
```

- [ ] **Step 5: Render the SimPanel in Live mode**

The main return currently has the trade card / veto grid followed by the checklist:

```tsx
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
          <TradeCard setup={tradeSetup} />
          <VetoList vetoes={vetoResults} />
        </div>

        <Checklist gates={gates} />
```

Insert the `SimPanel` between the grid and the `Checklist`, rendered only in Live mode:

```tsx
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
          <TradeCard setup={tradeSetup} />
          <VetoList vetoes={vetoResults} />
        </div>

        {mode === 'live' && <SimPanel state={sim.state} stats={sim.stats} onReset={sim.reset} />}

        <Checklist gates={gates} />
```

- [ ] **Step 6: Keep App.test deterministic**

Open `src/App.test.tsx`. If it does not already clear storage between tests, add this near the other test setup (after the `vi.mock(...)` calls, before the first `test(`):

```tsx
import { beforeEach } from 'vitest'
beforeEach(() => localStorage.clear())
```

(If `beforeEach` is already imported, don't duplicate the import.) No existing assertion targets sim text, so nothing else changes.

- [ ] **Step 7: Verify the whole suite + build**

Run:
```bash
npm run typecheck && npx eslint . && npm run test:run && npm run build
```
Expected: typecheck clean, eslint clean, ALL tests pass (was 194 before this feature; +21 new: engine 10, stats 2, useSim 5, SimPanel 4), build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(sim): wire paper-trading sim into App (Live mode)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Manual verification (browser smoke)

**Files:** none (verification only).

- [ ] **Step 1: Run the app and drive the sim with a demo setup for a quick visual check**

Because a real live setup is rare, temporarily confirm the panel renders by checking Live mode shows the empty Paper Trading panel, and that the panel's stats/labels look right. Use the run skill or `npm run dev`.

Expected in Live mode:
- A "Paper Trading" panel appears below the trade card / vetoes with the "Paper · credits, not real money" label and the empty-state copy ("No paper trades yet…").
- Balance shows `10,000`; Win rate / Avg R / Return show `—` until trades exist.
- Reset is present; there is no buy/order/execute button.
- The panel does NOT appear in demo mode (switch the DATA dropdown to a demo preset and confirm it's hidden).

- [ ] **Step 2: (Optional) confirm an open position renders**

If a live setup does not form during the check, this is acceptable — the engine + hook tests already prove open/settle. Note in the report that the open/closed states are unit-verified and the empty/live-gating states were visually confirmed.

---

## Self-Review

**Spec coverage:**
- Pure sim reducer (open on authorized, settle at TP2/SL, SL-first, one-at-a-time, re-arm) → Task 1. ✓
- Stats (win-rate, avg R, pnl, return) → Task 2. ✓
- useSim: live-only, candle-time dedup, localStorage persistence, reset → Task 3. ✓
- SimPanel: balance/win-rate/record/avg-R/return, open position, recent trades, PAPER label, empty state, reset, no buy control → Task 4. ✓
- App wiring: verdict computed once, hook above the early return, SimPanel in Live mode only → Task 5. ✓
- Non-goals (cron, accounts, manual mode, analytics, partials) → not implemented. ✓
- Edge cases: both-touched (Task 1 test), zero-risk guard (Task 1 test), corrupt storage fallback (Task 3 code), app-closed (no step when ctx null — Task 3). ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `SimState`/`SimTrade`/`SimPosition`/`SimConfig` (Task 1) are consumed unchanged by stats (Task 2), useSim (Task 3), SimPanel (Task 4). `simStep(state, signal, config, latest)` and `SetupSignal` (Task 1) are used identically in useSim. `useSim(ctx, verdict, enabled, config)` (Task 3) matches the App call site (Task 5). `SimPanel({ state, stats, onReset })` (Task 4) matches the App render (Task 5). `simConfigFrom` / `SIM_STARTING_BALANCE` (Task 1 config.ts) consumed by useSim (Task 3). ✓
