# 24/7 Server Tick (Phase A.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the paper-trading forward-test 24/7 on the server (GitHub Actions → protected `/api/sim-tick` → Vercel KV), with the client reading a shared server record and richer trade history.

**Architecture:** All decision logic lives in **pure, testable `src/` modules** (`parseCandles`, `forwardTest`, `serverTick`); the `api/` serverless functions are thin I/O wrappers over them (fetch + Vercel KV + clock). The client stops stepping locally and just reads `/api/sim-state`.

**Tech Stack:** React 18 + Vite + TypeScript (strict, `noUncheckedIndexedAccess`) + Vitest (jsdom) + Vercel serverless (`@vercel/node`) + Vercel KV (`@vercel/kv`) + GitHub Actions.

## Global Constraints

- Pure modules do no I/O and no clock: `src/sim/*`, `src/data/parseCandles.ts`, `src/forwardTest.ts`, `src/serverTick.ts` must not call `fetch`, `Date.now()`, `Math.random()`, or read env. Time flows in as parameters (`now`, `candle.time`).
- Import direction downward only: `ui → hooks → (forwardTest, serverTick) → scoring → sim → … → types`; `src/sim` still imports only `../types`.
- **Secrets stay server-side:** `TWELVEDATA_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SIM_TICK_SECRET` are read only in `api/*` via `process.env`; none reach the client bundle.
- Twelve Data requests always include `timezone=UTC`. Datetimes parse as UTC epoch ms.
- **Budget:** M5 fetched every tick; M15/H1 only when their interval elapsed (`isDue`). Target ~408 calls/day.
- **Graceful limit:** a Twelve Data credit-limit response must not crash the tick — stamp `limitReachedAt`, skip stepping, return 200; auto-resume next successful tick.
- Read-only ethos: no order-placement controls; the client Reset is removed (reset is an admin-only protected endpoint).
- Commands: `npm run test:run -- <path>`, `npm run typecheck`, `npx eslint .`, `npm run build`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- Create `src/data/parseCandles.ts` — pure Twelve Data value→`Candle[]` parser (extracted from `twelveData.ts`).
- Modify `src/data/twelveData.ts` — use the extracted parser.
- Create `src/forwardTest.ts` — `verdictToSignal` + pure `advanceSim`.
- Create `src/serverTick.ts` — `SimBlob`, `initBlob`, `isDue`, `planFetch`, `applyTick`, `applyLimit`, `isCreditLimitError` (all pure).
- Create `api/_twelvedata.ts` — server candle fetch (`fetchCandles`) + `CreditLimitError` (I/O).
- Create `api/sim-tick.ts` — protected tick + admin reset (thin).
- Create `api/sim-state.ts` — public read (thin).
- Create `src/hooks/useServerSim.ts` — read-only client hook; **delete** `src/hooks/useSim.ts` + `useSim.test.ts`.
- Modify `src/ui/SimPanel.tsx` — drop Reset, add limit note + enriched history rows + `fmtPhtDateTime`.
- Modify `src/App.tsx` — swap `useSim` → `useServerSim`.
- Create `.github/workflows/sim-tick.yml` — the cron.
- Add dependency `@vercel/kv`.

---

## Task 1: Extract the shared candle parser

**Files:**
- Create: `src/data/parseCandles.ts`
- Modify: `src/data/twelveData.ts`
- Test: `src/data/parseCandles.test.ts`

**Interfaces:**
- Produces: `type TwelveDataValue = { datetime: string; open: string; high: string; low: string; close: string; volume?: string }` and `parseCandles(values: TwelveDataValue[]): Candle[]` (map → numeric `Candle`, ascending by `time`, UTC datetime → epoch ms).
- Consumes: `Candle` from `src/types.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/parseCandles.test.ts
import { describe, expect, it } from 'vitest'
import { parseCandles, type TwelveDataValue } from './parseCandles'

const row = (datetime: string, o: number): TwelveDataValue => ({
  datetime, open: String(o), high: String(o + 1), low: String(o - 1), close: String(o + 0.5),
})

describe('parseCandles', () => {
  it('parses UTC datetimes to epoch ms and sorts ascending', () => {
    // provider returns newest-first; we want oldest-first
    const out = parseCandles([row('2026-08-14 12:05:00', 2400), row('2026-08-14 12:00:00', 2390)])
    expect(out.map((c) => c.time)).toEqual([
      Date.UTC(2026, 7, 14, 12, 0, 0),
      Date.UTC(2026, 7, 14, 12, 5, 0),
    ])
    expect(out[0]).toMatchObject({ open: 2390, high: 2391, low: 2389, close: 2390.5 })
  })

  it('includes volume only when present and non-empty', () => {
    const withVol: TwelveDataValue = { ...row('2026-08-14 12:00:00', 2400), volume: '123' }
    const noVol: TwelveDataValue = { ...row('2026-08-14 12:00:00', 2400), volume: '' }
    expect(parseCandles([withVol])[0]!.volume).toBe(123)
    expect(parseCandles([noVol])[0]!.volume).toBeUndefined()
  })

  it('throws on an unparseable datetime', () => {
    expect(() => parseCandles([row('not-a-date', 2400)])).toThrow(/Unparseable/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/data/parseCandles.test.ts`
Expected: FAIL — `Cannot find module './parseCandles'`.

- [ ] **Step 3: Write the parser**

```ts
// src/data/parseCandles.ts
import type { Candle } from '../types'

/** Raw shape of a single value row in a successful Twelve Data response. */
export type TwelveDataValue = {
  datetime: string
  open: string
  high: string
  low: string
  close: string
  volume?: string
}

/**
 * Parse a Twelve Data `datetime` string as UTC epoch milliseconds. Twelve Data returns
 * space-separated timestamps (`'2026-08-14 12:05:00'`) with no zone; we request timezone=UTC
 * and treat them as UTC so parsing is deterministic across machines.
 */
function parseUtcMillis(datetime: string): number {
  const iso = datetime.includes(' ') ? `${datetime.replace(' ', 'T')}Z` : datetime
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`Unparseable Twelve Data datetime: "${datetime}".`)
  return ms
}

function normalizeValue(v: TwelveDataValue): Candle {
  const candle: Candle = {
    time: parseUtcMillis(v.datetime),
    open: Number(v.open),
    high: Number(v.high),
    low: Number(v.low),
    close: Number(v.close),
  }
  if (v.volume !== undefined && v.volume !== '') candle.volume = Number(v.volume)
  return candle
}

/** Normalize Twelve Data's newest-first string rows into ascending numeric `Candle[]`. */
export function parseCandles(values: TwelveDataValue[]): Candle[] {
  return values.map(normalizeValue).sort((a, b) => a.time - b.time)
}
```

- [ ] **Step 4: Refactor `twelveData.ts` to use the parser**

In `src/data/twelveData.ts`: delete the local `TwelveDataValue` type, `normalizeValue`, and `parseUtcMillis`; import from `parseCandles`; and replace the tail of `fetchCandles` (`return payload.values.map(normalizeValue).sort(...)`) with `return parseCandles(payload.values)`. Update the `TwelveDataResponse` type to import `TwelveDataValue`:

```ts
import type { Candle } from '../types'
import { parseCandles, type TwelveDataValue } from './parseCandles'
// …
type TwelveDataResponse =
  | { status: 'ok'; values: TwelveDataValue[] }
  | { status: 'error'; code: number; message: string }
// … inside fetchCandles, after the error/array guards:
  return parseCandles(payload.values)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/data/parseCandles.test.ts src/data/twelveData.test.ts`
Expected: PASS (both files green — the existing twelveData tests still pass through the extracted parser).

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck && npx eslint src/data
git add src/data/parseCandles.ts src/data/parseCandles.test.ts src/data/twelveData.ts
git commit -m "refactor: extract shared parseCandles from twelveData

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: forwardTest — verdictToSignal + advanceSim

**Files:**
- Create: `src/forwardTest.ts`
- Test: `src/forwardTest.test.ts`

**Interfaces:**
- Consumes: `evaluateSetup`, `type SetupVerdict` (`src/scoring/evaluateSetup`); `simStep`, `type SetupSignal` (`src/sim/engine`); `SimState`, `SimConfig` (`src/sim/types`); `Candle`, `Config`, `MarketContext`, `Direction` (`src/types`).
- Produces: `verdictToSignal(v: SetupVerdict): SetupSignal`; `advanceSim(state: SimState, lastProcessedTime: number | null, ctx: MarketContext, config: Config): { state: SimState; lastProcessedTime: number | null }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/forwardTest.test.ts
import { describe, expect, it } from 'vitest'
import { advanceSim, verdictToSignal } from './forwardTest'
import { initialSimState } from './sim/engine'
import { defaultConfig } from './config'
import type { SimConfig } from './sim/types'
import type { SetupVerdict } from './scoring/evaluateSetup'
import type { Candle, MarketContext } from './types'

const simConfig: SimConfig = { startingBalance: 10_000, riskPct: 0.01 }
const bar = (time: number, o: number, h: number, l: number, c: number): Candle => ({ time, open: o, high: h, low: l, close: c })

const setup = (): SetupVerdict => ({
  status: 'setup', direction: 'long', level: 95, entry: 100, sl: 95, tp1: 105, tp2: 110, lot: 0.1,
  gates: [], supporting: [], vetoes: [], score: { passed: 7, band: 'strong', authorized: true },
})
const wait = (): SetupVerdict => ({
  status: 'wait', blockedBy: 'h1-m15-bias', direction: null,
  gates: [], supporting: [], vetoes: [], score: { passed: 0, band: 'wait', authorized: false },
})

describe('verdictToSignal', () => {
  it('maps an authorized setup to a signal using tp2 as the target', () => {
    expect(verdictToSignal(setup())).toEqual({ authorized: true, direction: 'long', entry: 100, sl: 95, tp: 110 })
  })
  it('maps a wait verdict to unauthorized', () => {
    expect(verdictToSignal(wait())).toEqual({ authorized: false })
  })
})

// advanceSim: build a MarketContext whose evaluateSetup verdict we control by choosing candles is
// hard, so exercise the WATERMARK + stepping behavior directly with a wait-producing context
// (a single flat candle can't authorize) and assert dedup + no-op semantics.
describe('advanceSim', () => {
  const flat = bar(0, 100, 100, 100, 100)
  const ctxAt = (times: number[]): MarketContext => {
    const m5 = times.map((t) => bar(t, 100, 100, 100, 100))
    return { m5, m15: [flat], h1: [flat] }
  }

  it('steps only candles newer than the watermark and advances it to the latest time', () => {
    const s0 = initialSimState(simConfig)
    const r1 = advanceSim(s0, null, ctxAt([1, 2, 3]), defaultConfig)
    expect(r1.lastProcessedTime).toBe(3)
    // Re-running with the same candles is a no-op (nothing newer than the watermark).
    const r2 = advanceSim(r1.state, r1.lastProcessedTime, ctxAt([1, 2, 3]), defaultConfig)
    expect(r2.lastProcessedTime).toBe(3)
    expect(r2.state).toEqual(r1.state)
  })

  it('returns the same watermark and unchanged state when there are no candles', () => {
    const s0 = initialSimState(simConfig)
    const r = advanceSim(s0, 5, { m5: [], m15: [flat], h1: [flat] }, defaultConfig)
    expect(r.lastProcessedTime).toBe(5)
    expect(r.state).toBe(s0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/forwardTest.test.ts`
Expected: FAIL — `Cannot find module './forwardTest'`.

- [ ] **Step 3: Write the module**

```ts
// src/forwardTest.ts
import type { Config, MarketContext } from './types'
import type { SetupVerdict } from './scoring/evaluateSetup'
import { evaluateSetup } from './scoring/evaluateSetup'
import { simStep, type SetupSignal } from './sim/engine'
import type { SimState } from './sim/types'

/** Map an engine verdict to the sim's narrow signal (tp2 is the paper target). */
export function verdictToSignal(verdict: SetupVerdict): SetupSignal {
  if (verdict.status === 'setup') {
    return { authorized: true, direction: verdict.direction, entry: verdict.entry, sl: verdict.sl, tp: verdict.tp2 }
  }
  return { authorized: false }
}

/**
 * Step the sim over EVERY M5 candle newer than `lastProcessedTime`, using the verdict computed
 * once from the full current context. Robust to delayed/missed ticks — a batch of new candles is
 * simply processed on the next run, so no candle (or exit) is skipped. Pure.
 *
 * Approximation (documented): exits (`settle`) read only each candle's high/low and are
 * per-candle-accurate; opens use the single current verdict. Correct for a history/win-rate tool.
 */
export function advanceSim(
  state: SimState,
  lastProcessedTime: number | null,
  ctx: MarketContext,
  config: Config,
): { state: SimState; lastProcessedTime: number | null } {
  const signal = verdictToSignal(evaluateSetup(ctx, config))
  let s = state
  let last = lastProcessedTime
  for (const candle of ctx.m5) {
    if (last !== null && candle.time <= last) continue
    s = simStep(s, signal, config, candle)
    last = candle.time
  }
  return { state: s, lastProcessedTime: last }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/forwardTest.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck && npx eslint src/forwardTest.ts
git add src/forwardTest.ts src/forwardTest.test.ts
git commit -m "feat: forwardTest — verdictToSignal + pure advanceSim (step over new candles)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: serverTick — pure tick reducers

**Files:**
- Create: `src/serverTick.ts`
- Test: `src/serverTick.test.ts`

**Interfaces:**
- Consumes: `advanceSim` (`src/forwardTest`); `initialSimState`, `SimState`, `SimConfig` (`src/sim/*`); `Candle`, `Config`, `MarketContext` (`src/types`).
- Produces:
  - `type SimBlob = { state: SimState; lastProcessedTime: number | null; m15: Candle[]; h1: Candle[]; m15FetchedAt: number | null; h1FetchedAt: number | null; limitReachedAt: number | null; updatedAt: number | null }`
  - `initBlob(simConfig: SimConfig): SimBlob`
  - `isDue(intervalMs: number, fetchedAt: number | null, now: number): boolean`
  - `planFetch(blob: SimBlob, now: number): { m15: boolean; h1: boolean }`
  - `applyTick(blob: SimBlob, fetched: { m5: Candle[]; m15?: Candle[]; h1?: Candle[] }, config: Config, now: number): SimBlob`
  - `applyLimit(blob: SimBlob, now: number): SimBlob`
  - `isCreditLimitError(payload: unknown): boolean`
  - Constants `M15_MS = 15 * 60_000`, `H1_MS = 60 * 60_000`.

- [ ] **Step 1: Write the failing test**

```ts
// src/serverTick.test.ts
import { describe, expect, it } from 'vitest'
import { applyLimit, applyTick, initBlob, isCreditLimitError, isDue, planFetch, M15_MS, H1_MS } from './serverTick'
import { defaultConfig } from './config'
import type { SimConfig } from './sim/types'
import type { Candle } from './types'

const simConfig: SimConfig = { startingBalance: 10_000, riskPct: 0.01 }
const flat = (t: number): Candle => ({ time: t, open: 100, high: 100, low: 100, close: 100 })

describe('isDue', () => {
  it('is due when never fetched or the interval has elapsed', () => {
    expect(isDue(M15_MS, null, 1000)).toBe(true)
    expect(isDue(M15_MS, 0, M15_MS)).toBe(true)
    expect(isDue(M15_MS, 0, M15_MS - 1)).toBe(false)
  })
})

describe('planFetch', () => {
  it('fetches higher timeframes only when their interval has elapsed', () => {
    const blob = initBlob(simConfig)
    expect(planFetch(blob, 1000)).toEqual({ m15: true, h1: true }) // never fetched → due
    const warm = { ...blob, m15FetchedAt: 1000, h1FetchedAt: 1000 }
    expect(planFetch(warm, 1000 + M15_MS - 1)).toEqual({ m15: false, h1: false })
    expect(planFetch(warm, 1000 + M15_MS)).toEqual({ m15: true, h1: false })
    expect(planFetch(warm, 1000 + H1_MS)).toEqual({ m15: true, h1: true })
  })
})

describe('applyTick', () => {
  it('reuses cached m15/h1 when not refetched, refreshes fetch times when it is', () => {
    const blob = { ...initBlob(simConfig), m15: [flat(1)], h1: [flat(1)], m15FetchedAt: 500, h1FetchedAt: 500 }
    const next = applyTick(blob, { m5: [flat(2)] }, defaultConfig, 999)
    expect(next.m15).toEqual([flat(1)]) // reused
    expect(next.m15FetchedAt).toBe(500) // unchanged (not refetched)
    expect(next.updatedAt).toBe(999)
    expect(next.limitReachedAt).toBeNull()

    const refetched = applyTick(blob, { m5: [flat(2)], m15: [flat(2)] }, defaultConfig, 1000)
    expect(refetched.m15).toEqual([flat(2)])
    expect(refetched.m15FetchedAt).toBe(1000)
  })
})

describe('applyLimit', () => {
  it('stamps the limit time and does not touch state', () => {
    const blob = initBlob(simConfig)
    const out = applyLimit(blob, 4242)
    expect(out.limitReachedAt).toBe(4242)
    expect(out.state).toBe(blob.state)
  })
})

describe('isCreditLimitError', () => {
  it('recognizes Twelve Data credit/limit errors, ignores others', () => {
    expect(isCreditLimitError({ status: 'error', code: 429, message: 'run out of API credits' })).toBe(true)
    expect(isCreditLimitError({ status: 'error', code: 400, message: 'you have exhausted your daily limit' })).toBe(true)
    expect(isCreditLimitError({ status: 'error', code: 404, message: 'symbol not found' })).toBe(false)
    expect(isCreditLimitError({ status: 'ok', values: [] })).toBe(false)
    expect(isCreditLimitError(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/serverTick.test.ts`
Expected: FAIL — `Cannot find module './serverTick'`.

- [ ] **Step 3: Write the module**

```ts
// src/serverTick.ts
import type { Candle, Config, MarketContext } from './types'
import type { SimConfig, SimState } from './sim/types'
import { initialSimState } from './sim/engine'
import { advanceSim } from './forwardTest'

export const M15_MS = 15 * 60_000
export const H1_MS = 60 * 60_000

export type SimBlob = {
  state: SimState
  lastProcessedTime: number | null
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
    m15: [],
    h1: [],
    m15FetchedAt: null,
    h1FetchedAt: null,
    limitReachedAt: null,
    updatedAt: null,
  }
}

/** Due to (re)fetch when never fetched or the interval has elapsed since the last fetch. */
export function isDue(intervalMs: number, fetchedAt: number | null, now: number): boolean {
  return fetchedAt === null || now - fetchedAt >= intervalMs
}

/** Which higher timeframes to fetch this tick (M5 is always fetched). */
export function planFetch(blob: SimBlob, now: number): { m15: boolean; h1: boolean } {
  return {
    m15: isDue(M15_MS, blob.m15FetchedAt, now),
    h1: isDue(H1_MS, blob.h1FetchedAt, now),
  }
}

/** Advance the sim with freshly fetched M5 + fresh-or-cached M15/H1; refresh caches/timestamps. */
export function applyTick(
  blob: SimBlob,
  fetched: { m5: Candle[]; m15?: Candle[]; h1?: Candle[] },
  config: Config,
  now: number,
): SimBlob {
  const m15 = fetched.m15 ?? blob.m15
  const h1 = fetched.h1 ?? blob.h1
  const ctx: MarketContext = { m5: fetched.m5, m15, h1 }
  const advanced = advanceSim(blob.state, blob.lastProcessedTime, ctx, config)
  return {
    state: advanced.state,
    lastProcessedTime: advanced.lastProcessedTime,
    m15,
    h1,
    m15FetchedAt: fetched.m15 ? now : blob.m15FetchedAt,
    h1FetchedAt: fetched.h1 ? now : blob.h1FetchedAt,
    limitReachedAt: null,
    updatedAt: now,
  }
}

/** Record that the provider cut us off; leave state untouched. */
export function applyLimit(blob: SimBlob, now: number): SimBlob {
  return { ...blob, limitReachedAt: now }
}

/** Recognize a Twelve Data credit/rate-limit error payload. */
export function isCreditLimitError(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as { status?: unknown; code?: unknown; message?: unknown }
  if (p.status !== 'error') return false
  if (p.code === 429) return true
  return typeof p.message === 'string' && /credit|limit/i.test(p.message)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/serverTick.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck && npx eslint src/serverTick.ts
git add src/serverTick.ts src/serverTick.test.ts
git commit -m "feat: serverTick — pure blob/plan/apply reducers + limit detection

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: API endpoints + Vercel KV

**Files:**
- Create: `api/_twelvedata.ts`, `api/sim-tick.ts`, `api/sim-state.ts`
- Modify: `package.json` (add `@vercel/kv`)

**Interfaces:**
- Consumes: `fetchCandles` (`api/_twelvedata`); `SimBlob`, `initBlob`, `planFetch`, `applyTick`, `applyLimit` (`src/serverTick`); `simConfigFrom` (`src/sim/config`); `defaultConfig` (`src/config`); `kv` from `@vercel/kv`.
- Produces: HTTP endpoints `/api/sim-tick` (protected), `/api/sim-state` (public).

- [ ] **Step 1: Add the dependency**

Run: `npm install @vercel/kv`
Expected: `@vercel/kv` added to `package.json` dependencies; lockfile updated.

- [ ] **Step 2: Write `api/_twelvedata.ts` (server fetch)**

```ts
// api/_twelvedata.ts  (underscore prefix → not a route)
import type { Candle } from '../src/types'
import { parseCandles, type TwelveDataValue } from '../src/data/parseCandles'
import { isCreditLimitError } from '../src/serverTick'

const SYMBOL = 'XAU/USD'
const BASE_URL = 'https://api.twelvedata.com/time_series'

/** Thrown when Twelve Data reports credits/rate exhausted, so the tick can degrade gracefully. */
export class CreditLimitError extends Error {}

/** Fetch + normalize XAU/USD candles for one interval (server-side; key from env). timezone=UTC. */
export async function fetchCandles(interval: '5min' | '15min' | '1h', outputsize: number): Promise<Candle[]> {
  const key = process.env.TWELVEDATA_KEY
  if (!key || key.trim() === '') throw new Error('Server is missing TWELVEDATA_KEY')
  const url =
    `${BASE_URL}?symbol=${encodeURIComponent(SYMBOL)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&outputsize=${encodeURIComponent(String(outputsize))}` +
    `&timezone=UTC` +
    `&apikey=${encodeURIComponent(key)}`
  const res = await fetch(url)
  const payload = (await res.json()) as unknown
  if (isCreditLimitError(payload)) throw new CreditLimitError('Twelve Data credit limit reached')
  const p = payload as { status?: string; message?: string; values?: TwelveDataValue[] }
  if (p.status === 'error') throw new Error(`Twelve Data error: ${p.message ?? 'unknown'}`)
  if (!Array.isArray(p.values)) throw new Error('Twelve Data response missing values')
  return parseCandles(p.values)
}
```

- [ ] **Step 3: Write `api/sim-tick.ts` (protected tick + admin reset)**

```ts
// api/sim-tick.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'
import { defaultConfig } from '../src/config'
import { simConfigFrom } from '../src/sim/config'
import { initBlob, planFetch, applyTick, applyLimit, type SimBlob } from '../src/serverTick'
import { fetchCandles, CreditLimitError } from './_twelvedata'

const KEY = 'sim:v1'
const OUTPUT_SIZE = 200

function tokenOk(req: VercelRequest): boolean {
  const secret = process.env.SIM_TICK_SECRET
  if (!secret) return false
  const tokenParam = req.query.token
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam
  // Length-guard then compare; secrets are short so a plain compare is acceptable here.
  return typeof token === 'string' && token.length === secret.length && token === secret
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!process.env.SIM_TICK_SECRET) {
    res.status(500).json({ ok: false, message: 'Server missing SIM_TICK_SECRET' })
    return
  }
  if (!tokenOk(req)) {
    res.status(401).json({ ok: false, message: 'Unauthorized' })
    return
  }

  const simConfig = simConfigFrom(defaultConfig)
  const now = Date.now()
  const blob = ((await kv.get<SimBlob>(KEY)) as SimBlob | null) ?? initBlob(simConfig)

  // Admin reset.
  if (req.query.reset === '1') {
    await kv.set(KEY, initBlob(simConfig))
    res.status(200).json({ ok: true, reset: true })
    return
  }

  try {
    const plan = planFetch(blob, now)
    const m5 = await fetchCandles('5min', OUTPUT_SIZE)
    const m15 = plan.m15 ? await fetchCandles('15min', OUTPUT_SIZE) : undefined
    const h1 = plan.h1 ? await fetchCandles('1h', OUTPUT_SIZE) : undefined
    const next = applyTick(blob, { m5, m15, h1 }, defaultConfig, now)
    await kv.set(KEY, next)
    res.status(200).json({ ok: true, trades: next.state.trades.length, balance: next.state.balance })
  } catch (err) {
    if (err instanceof CreditLimitError) {
      await kv.set(KEY, applyLimit(blob, now))
      res.status(200).json({ ok: true, limited: true })
      return
    }
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : 'tick failed' })
  }
}
```

- [ ] **Step 4: Write `api/sim-state.ts` (public read)**

```ts
// api/sim-state.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'
import { defaultConfig } from '../src/config'
import { simConfigFrom } from '../src/sim/config'
import { initBlob, type SimBlob } from '../src/serverTick'

const KEY = 'sim:v1'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const blob = ((await kv.get<SimBlob>(KEY)) as SimBlob | null) ?? initBlob(simConfigFrom(defaultConfig))
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
  res.status(200).json({
    state: blob.state,
    meta: { limitReachedAt: blob.limitReachedAt, updatedAt: blob.updatedAt },
  })
}
```

- [ ] **Step 5: Typecheck + lint + commit**

Run:
```bash
npm run typecheck && npx eslint api src
```
Expected: clean. (These handlers are thin wrappers over the Task 1–3 pure modules, verified live post-deploy — no jsdom unit test.)

```bash
git add package.json package-lock.json api/_twelvedata.ts api/sim-tick.ts api/sim-state.ts
git commit -m "feat: sim-tick + sim-state endpoints backed by Vercel KV

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: useServerSim hook (replaces useSim)

**Files:**
- Create: `src/hooks/useServerSim.ts`
- Delete: `src/hooks/useSim.ts`, `src/hooks/useSim.test.ts`
- Test: `src/hooks/useServerSim.test.ts`

**Interfaces:**
- Consumes: `simStats`, `SimStats` (`src/sim/stats`); `initialSimState`, `SimState` (`src/sim/*`); `simConfigFrom` (`src/sim/config`); `defaultConfig` (`src/config`).
- Produces: `useServerSim(): { state: SimState; stats: SimStats; meta: { limitReachedAt: number | null; updatedAt: number | null }; loading: boolean }` (type `UseServerSim`).

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useServerSim.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useServerSim } from './useServerSim'

const serverState = {
  startingBalance: 10_000, balance: 10_200, open: null, armed: true, nextId: 2,
  trades: [{ id: 't1', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 100, rr: 2, openedAtTime: 0, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 200, closedAtTime: 1 }],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ state: serverState, meta: { limitReachedAt: null, updatedAt: 123 } }),
  })))
})
afterEach(() => vi.unstubAllGlobals())

describe('useServerSim', () => {
  it('fetches the server state on mount and derives stats', async () => {
    const { result } = renderHook(() => useServerSim())
    await waitFor(() => expect(result.current.state.balance).toBe(10_200))
    expect(result.current.stats.trades).toBe(1)
    expect(result.current.meta.updatedAt).toBe(123)
    expect(result.current.loading).toBe(false)
  })

  it('keeps the last-good state when a fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    const { result } = renderHook(() => useServerSim())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Falls back to an empty (initial) state, never throws.
    expect(result.current.state.trades).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/hooks/useServerSim.test.ts`
Expected: FAIL — `Cannot find module './useServerSim'`.

- [ ] **Step 3: Write the hook**

```ts
// src/hooks/useServerSim.ts
import { useEffect, useState } from 'react'
import { defaultConfig } from '../config'
import { simConfigFrom } from '../sim/config'
import { initialSimState } from '../sim/engine'
import { simStats, type SimStats } from '../sim/stats'
import type { SimState } from '../sim/types'

export type SimMeta = { limitReachedAt: number | null; updatedAt: number | null }
export type UseServerSim = { state: SimState; stats: SimStats; meta: SimMeta; loading: boolean }

const EMPTY_META: SimMeta = { limitReachedAt: null, updatedAt: null }

/**
 * Read-only view of the shared server forward-test. Fetches `/api/sim-state` on mount and polls
 * every 60s. On any failure it keeps the last-good state and never throws. The server owns
 * ticking now; this hook does not step or persist anything.
 */
export function useServerSim(): UseServerSim {
  const [state, setState] = useState<SimState>(() => initialSimState(simConfigFrom(defaultConfig)))
  const [meta, setMeta] = useState<SimMeta>(EMPTY_META)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/sim-state')
        if (!res.ok) return
        const json = (await res.json()) as { state?: SimState; meta?: SimMeta }
        if (alive && json.state) {
          setState(json.state)
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

  return { state, stats: simStats(state), meta, loading }
}
```

- [ ] **Step 4: Delete the retired A.1 hook**

```bash
git rm src/hooks/useSim.ts src/hooks/useSim.test.ts
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run -- src/hooks/useServerSim.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck && npx eslint src/hooks
git add src/hooks/useServerSim.ts src/hooks/useServerSim.test.ts
git commit -m "feat: useServerSim reads the shared server record; retire local useSim

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: SimPanel (limit note + rich history) + App wiring

**Files:**
- Modify: `src/ui/SimPanel.tsx`, `src/ui/SimPanel.test.tsx`, `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `useServerSim` (Task 5); `SimState` (`src/sim/types`), `SimStats` (`src/sim/stats`), `SimMeta` (`src/hooks/useServerSim`).
- Produces: `SimPanel({ state, stats, meta }: { state: SimState; stats: SimStats; meta: SimMeta }): ReactElement` (no `onReset`); `fmtPhtDateTime(ms: number): string`.

- [ ] **Step 1: Update `SimPanel.test.tsx`**

Replace the file with (drops the Reset test; adds the limit note + rich-row assertions):

```tsx
// src/ui/SimPanel.test.tsx
import { render, screen } from '@testing-library/react'
import { SimPanel, fmtPhtDateTime } from './SimPanel'
import { simStats } from '../sim/stats'
import type { SimState } from '../sim/types'
import type { SimMeta } from '../hooks/useServerSim'

const NO_META: SimMeta = { limitReachedAt: null, updatedAt: null }
const empty: SimState = { startingBalance: 10_000, balance: 10_000, open: null, armed: true, trades: [], nextId: 1 }

const winTrade = {
  id: 't1', direction: 'long' as const, entry: 4473.37, sl: 4478.48, tp: 4463.14, riskCredits: 100, rr: 2,
  openedAtTime: Date.UTC(2026, 7, 23, 13, 30), exit: 4463.14, exitReason: 'tp' as const,
  result: 'win' as const, rMultiple: 2, pnlCredits: 200, closedAtTime: Date.UTC(2026, 7, 23, 13, 50),
}

test('formats a closed time in Philippine time', () => {
  // 13:50 UTC → 21:50 PHT
  expect(fmtPhtDateTime(Date.UTC(2026, 7, 23, 13, 50))).toMatch(/23 Aug.*9:50/)
})

test('empty state + no reset button', () => {
  render(<SimPanel state={empty} stats={simStats(empty)} meta={NO_META} />)
  expect(screen.getByText(/credits, not real money/i)).toBeInTheDocument()
  expect(screen.getByText(/No paper trades yet/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
})

test('a trade row shows entry, target, exit, R, credits, and a PHT date-time', () => {
  const state: SimState = { ...empty, balance: 10_200, trades: [winTrade] }
  render(<SimPanel state={state} stats={simStats(state)} meta={NO_META} />)
  expect(screen.getByText(/4,473.37/)).toBeInTheDocument() // entry
  expect(screen.getByText(/4,463.14/)).toBeInTheDocument() // target/exit
  expect(screen.getByText(/23 Aug/)).toBeInTheDocument()
  expect(screen.getByText('win')).toBeInTheDocument() // sr-only status label
})

test('shows the data-limit note when the limit is newer than the last update', () => {
  const meta: SimMeta = { limitReachedAt: Date.UTC(2026, 7, 23, 13, 50), updatedAt: Date.UTC(2026, 7, 23, 12, 0) }
  render(<SimPanel state={empty} stats={simStats(empty)} meta={meta} />)
  expect(screen.getByText(/Data limit reached/i)).toBeInTheDocument()
})

test('hides the data-limit note once an update is newer', () => {
  const meta: SimMeta = { limitReachedAt: Date.UTC(2026, 7, 23, 12, 0), updatedAt: Date.UTC(2026, 7, 23, 13, 0) }
  render(<SimPanel state={empty} stats={simStats(empty)} meta={meta} />)
  expect(screen.queryByText(/Data limit reached/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/ui/SimPanel.test.tsx`
Expected: FAIL (`fmtPhtDateTime` / new props not exported).

- [ ] **Step 3: Update `SimPanel.tsx`**

Change the signature to `{ state, stats, meta }` (drop `onReset`), remove the Reset `<button>`, add the `fmtPhtDateTime` export, the limit note, and the enriched two-line trade row. Replace the component's prop type + header Reset button + the recent-trades `.map(...)` with:

```tsx
// add near the top (exported helper)
export function fmtPhtDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// signature
export function SimPanel({
  state,
  stats,
  meta,
}: {
  state: SimState
  stats: SimStats
  meta: SimMeta
}): ReactElement {
  const up = stats.pnlCredits >= 0
  const rSign = stats.avgR >= 0 ? '+' : '−'
  const showLimit = meta.limitReachedAt !== null && meta.limitReachedAt > (meta.updatedAt ?? 0)
```

Replace the header's right side (the old Reset button) with nothing (the header keeps only the title + PAPER chip). After the stat grid, add the limit note:

```tsx
      {showLimit && meta.limitReachedAt !== null && (
        <div className="border-t border-border bg-build-bg px-[18px] py-2.5 text-[12px] text-build-fg">
          Data limit reached at {fmtPhtDateTime(meta.limitReachedAt)} PHT — updates resume after the
          provider's daily reset.
        </div>
      )}
```

Replace each recent-trade row body with the two-line rich row:

```tsx
            {[...state.trades]
              .slice(-8)
              .reverse()
              .map((t) => (
                <div key={t.id} className="border-b border-border px-1.5 py-2.5 last:border-b-0">
                  <div className="flex items-center gap-2.5">
                    <StatusIcon status={t.result === 'win' ? 'pass' : 'fail'} size={20} />
                    <span className="sr-only">{t.result}</span>
                    <span className={`text-[12.5px] font-semibold ${t.direction === 'long' ? 'text-pass-fg' : 'text-fail-fg'}`}>
                      {t.direction === 'long' ? 'LONG' : 'SHORT'}
                    </span>
                    <span className="font-mono text-[12px] text-ink-2">
                      entry {fmt(t.entry)} → target {fmt(t.tp)} · {t.exitReason.toUpperCase()} @ {fmt(t.exit)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 pl-[30px] font-mono text-[11.5px] text-ink-3">
                    <span className={t.result === 'win' ? 'text-pass-fg' : 'text-fail-fg'}>
                      {t.rMultiple >= 0 ? '+' : '−'}
                      {Math.abs(t.rMultiple).toFixed(1)}R · {signed(Math.round(t.pnlCredits))}
                    </span>
                    <span>{fmtPhtDateTime(t.closedAtTime)} PHT</span>
                  </div>
                </div>
              ))}
```

Add the imports the component now needs: `import type { SimMeta } from '../hooks/useServerSim'` (and keep `fmt`/`signed`/`StatusIcon`). Keep the existing `fmt`/`signed` helpers.

- [ ] **Step 4: Wire `App.tsx`**

Replace the `useSim` import + call and the Paper-tab render:

```tsx
// import
import { useServerSim } from './hooks/useServerSim'
// (remove `import { useSim } from './hooks/useSim'`)

// inside App(), replace the `const sim = useSim(...)` line with:
  const sim = useServerSim()
// (also remove `LOADING_VERDICT` if it is now unused — it was only passed to useSim; keep the
//  `verdict`/`result` computation for the rest of the UI as-is.)

// Paper tab render:
  {tab === 'paper' &&
    (mode === 'live' ? (
      <SimPanel state={sim.state} stats={sim.stats} meta={sim.meta} />
    ) : (
      <div className="rounded-panel border border-border bg-surface px-[18px] py-8 text-center text-[12.5px] text-ink-2 shadow-panel">
        Paper trading records the shared <b className="text-ink">Live</b> forward-test. Switch to Live
        to view it.
      </div>
    ))}
```

Note: `useServerSim()` takes no args, so the `verdict ?? LOADING_VERDICT` argument and `LOADING_VERDICT` const are no longer needed for the sim. If `LOADING_VERDICT` becomes unused, delete it to keep eslint clean.

- [ ] **Step 5: Update `App.test.tsx` for the read-only sim**

`App.test.tsx` no longer has a client sim stepping or a Reset button. In the "interactive controls" test, the Paper tab now shows the server panel (no Reset). Update the Paper-tab assertion: after `fireEvent.click(screen.getByRole('tab', { name: 'Paper' }))`, assert the PAPER label is present instead of a Reset button:

```tsx
  // Paper tab: the shared server record (no Reset — reset is admin-only).
  fireEvent.click(screen.getByRole('tab', { name: 'Paper' }))
  expect(screen.getByText(/credits, not real money/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
```

`App.test` mocks `useMarketData` but not `fetch`; `useServerSim` calls `fetch('/api/sim-state')`. Add a fetch stub near the other mocks so the hook resolves to an empty state:

```tsx
import { afterEach } from 'vitest'
// after the existing vi.mock(...) calls:
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
})
afterEach(() => vi.unstubAllGlobals())
```

(If `beforeEach` is already declared for `localStorage.clear()`, merge the two into one `beforeEach`.)

- [ ] **Step 6: Run the affected tests**

Run: `npm run test:run -- src/ui/SimPanel.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint + commit**

```bash
npm run typecheck && npx eslint .
git add src/ui/SimPanel.tsx src/ui/SimPanel.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: SimPanel reads server sim — rich history rows + data-limit note

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: GitHub Actions cron

**Files:**
- Create: `.github/workflows/sim-tick.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/sim-tick.yml
name: sim-tick
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch: {}

# Prevent overlapping runs if a tick is slow.
concurrency:
  group: sim-tick
  cancel-in-progress: false

jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - name: Ping the sim tick
        env:
          SECRET: ${{ secrets.SIM_TICK_SECRET }}
        run: |
          curl -fsS --max-time 60 \
            "https://northmark-one.vercel.app/api/sim-tick?token=${SECRET}" \
            -o /dev/null -w "tick HTTP %{http_code}\n"
```

- [ ] **Step 2: Validate + commit**

The workflow YAML is validated by GitHub on push; there's no local test. Confirm it parses (no tabs, correct indentation) by eye, then:

```bash
git add .github/workflows/sim-tick.yml
git commit -m "ci: 5-min GitHub Actions cron pinging the protected sim tick

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full verification

**Files:** none (verification + provisioning notes only).

- [ ] **Step 1: Full suite + build**

Run: `npm run typecheck && npx eslint . && npm run test:run && npm run build`
Expected: typecheck clean, eslint clean, ALL tests pass (was 218 before this feature; net change: +parseCandles 3, +forwardTest 4, +serverTick ~7, +useServerSim 2, SimPanel tests reworked, −useSim 5), build succeeds.

- [ ] **Step 2: Record the provisioning steps in the report**

The live endpoints require (Luis does these; they cannot be done from code):
1. Vercel dashboard → **Storage → create a KV store** → link to the project (auto-injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
2. Generate a random `SIM_TICK_SECRET`; add it as a **Vercel env var** AND a **GitHub Actions repo secret** of the same name.
3. Deploy.

- [ ] **Step 3: Post-deploy smoke (after provisioning)**

- `curl "https://northmark-one.vercel.app/api/sim-tick?token=WRONG"` → `401`.
- `curl "https://northmark-one.vercel.app/api/sim-tick?token=SECRET"` → `{ "ok": true, ... }`.
- `curl "https://northmark-one.vercel.app/api/sim-state"` → `{ "state": {...}, "meta": {...} }`.
- Open the app → Paper tab shows the shared record; no Reset button.

---

## Self-Review

**Spec coverage:**
- Shared parser (parseCandles) → Task 1. ✓
- Pure orchestration (verdictToSignal, advanceSim, step-over-new-candles) → Task 2. ✓
- SimBlob + pure tick reducers (planFetch/isDue/applyTick/applyLimit) + credit-limit detection → Task 3. ✓
- Server fetch + endpoints + KV + admin reset → Task 4. ✓
- Client read-only hook; retire useSim → Task 5. ✓
- SimPanel: no Reset, limit note, rich history (entry/target/exit/R/credits/PHT date-time) → Task 6. ✓
- GitHub Actions cron → Task 7. ✓
- Verification + provisioning → Task 8. ✓
- Non-goals (accounts, manual mode, analytics, loss-limit wiring, backfill) → not implemented. ✓
- Security (secrets server-side, token-protected tick, public read) → Tasks 4/7 + Global Constraints. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `SimBlob` (Task 3) is consumed unchanged by the endpoints (Task 4). `advanceSim(state, lastProcessedTime, ctx, config)` (Task 2) consumed by `applyTick` (Task 3). `SimMeta` (Task 5) consumed by `SimPanel` (Task 6) and returned by `useServerSim`. `SimPanel({ state, stats, meta })` (Task 6) matches the App render. `parseCandles(values)` / `TwelveDataValue` (Task 1) consumed by `_twelvedata.ts` (Task 4) and `twelveData.ts` (Task 1). `verdictToSignal`/`SetupSignal` consistent between forwardTest and sim. ✓
