# Dual-Engine Bake-off — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the bake-off with (a) a **pluggable, off-by-default economic-calendar news feed** that activates the Claude engine's news-blackout veto when a provider key is configured — degrading gracefully (veto inactive + visible indicator) when it is not — and (b) a **win-rate-by-grade analytics** view for the Claude paper account.

**Architecture:** A pure provider adapter parses an economic-calendar payload into the existing `NewsEvent[]`. The server tick fetches the calendar on its own cadence (only when `NEWS_API_KEY` is set), caches it in the sim blob, and threads it into `evaluateSetupClaude` — so the Claude paper account respects real news. `/api/sim-state` also returns the cached events + a feed-active flag, so the **client-side Signal verdict uses the same news** (closing the loop between the server sim and the live Signal tab). A pure `gradeStats` groups the Claude account's trades by grade; `GradeAnalytics` renders it under the Claude Paper panel.

**Tech Stack:** TypeScript (strict, NodeNext ESM — imports end in `.js`), React 18, Vite, Tailwind, Vitest, Vercel serverless (`api/`), Upstash Redis.

## Global Constraints

- Read-only / paper only — no order execution.
- Import direction one-way: `indicators → gates → scoring/edge → sim → ui`. `sim`/`ui` may type-only-import from `edge`. No upward imports.
- Pure `src/edge`, `src/sim`, `src/scoring` — no clock/IO/randomness; timestamps passed in. All network/env access lives in `api/`.
- **News feed is OFF BY DEFAULT and MUST degrade gracefully.** With no `NEWS_API_KEY`: no fetch, `news = []`, the veto is simply inactive, and the UI shows a "news feed inactive" indicator. It must never fabricate events, never hard-block, and never 500 because a key/provider is missing.
- Provider adapter must be **defensive**: tolerate missing/renamed fields, both `{ economicCalendar: [...] }` and a bare array, string or epoch times. Map country `US` → currency `USD`. It is pure and unit-tested; the network call is a thin `api/` helper.
- The same cached events feed BOTH the server sim (`applyTick`) and the client Signal verdict (via `/api/sim-state` → `useServerSim` → `App`), so the two never disagree about news.
- NodeNext `.js` imports. Final gate before PR: `npm run typecheck && npm run test:run && npm run lint && npm run build` all green.
- Reuse existing types: `NewsEvent` (`src/edge/newsWindow.ts`), `newsBlackout`, `evaluateSetupClaude`, `Grade` (`src/edge/scoreSetup.ts`), `SimState`/`SimTrade`, `SimBlob`.
- Out of scope: per-engine chart markers (still deferred). No provider account is created by this work — the key is the user's to set in Vercel env.

---

### Task 1: Economic-calendar provider adapter (pure)

**Files:**
- Create: `src/edge/newsProvider.ts`
- Test: `src/edge/newsProvider.test.ts`

**Interfaces:**
- Consumes: `NewsEvent` from `./newsWindow.js`.
- Produces: `parseEconomicCalendar(raw: unknown): NewsEvent[]` — defensively maps a Finnhub-style economic-calendar payload (or a bare array) into `NewsEvent[]`. Skips entries it cannot parse.

- [ ] **Step 1: Write the failing test**

```ts
// src/edge/newsProvider.test.ts
import { describe, expect, it } from 'vitest'
import { parseEconomicCalendar } from './newsProvider'

describe('parseEconomicCalendar', () => {
  it('maps a Finnhub-style { economicCalendar: [...] } payload to NewsEvent[]', () => {
    const raw = {
      economicCalendar: [
        { time: '2026-08-28 12:30:00', country: 'US', event: 'CPI m/m', impact: 'high' },
        { time: '2026-08-28 14:00:00', country: 'DE', event: 'Ifo', impact: 'medium' },
      ],
    }
    const events = parseEconomicCalendar(raw)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({
      time: Date.parse('2026-08-28T12:30:00Z'),
      impact: 'high',
      currency: 'USD',
      title: 'CPI m/m',
    })
    expect(events[1]?.currency).toBe('EUR') // DE → EUR
  })

  it('accepts a bare array and epoch-second times', () => {
    const raw = [{ time: 1_800_000_000, country: 'US', event: 'NFP', impact: 'high' }]
    const events = parseEconomicCalendar(raw)
    expect(events[0]?.time).toBe(1_800_000_000_000) // seconds → ms
    expect(events[0]?.title).toBe('NFP')
  })

  it('skips unparseable entries and tolerates missing impact (defaults low)', () => {
    const raw = { economicCalendar: [{ country: 'US', event: 'No time here' }, { time: 'garbage', country: 'US', event: 'Bad' }] }
    expect(parseEconomicCalendar(raw)).toHaveLength(0)
  })

  it('returns [] for non-object / null input', () => {
    expect(parseEconomicCalendar(null)).toEqual([])
    expect(parseEconomicCalendar('nope')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/edge/newsProvider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/edge/newsProvider.ts
import type { NewsEvent } from './newsWindow.js'

/** ISO-2 country → FX currency for the events we care about; unknown → the code itself. */
const COUNTRY_CCY: Record<string, string> = {
  US: 'USD', EU: 'EUR', DE: 'EUR', FR: 'EUR', GB: 'GBP', UK: 'GBP',
  JP: 'JPY', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CN: 'CNY',
}

function impactOf(raw: unknown): NewsEvent['impact'] {
  const s = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (s.includes('high') || s === '3') return 'high'
  if (s.includes('medium') || s.includes('med') || s === '2') return 'medium'
  return 'low'
}

/** Parse a time that may be an ISO/space string (assumed UTC) or epoch seconds/ms → epoch ms, or null. */
function timeMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw // seconds vs ms heuristic
  }
  if (typeof raw === 'string') {
    // "2026-08-28 12:30:00" → treat as UTC.
    const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z')
    const t = Date.parse(iso)
    return Number.isNaN(t) ? null : t
  }
  return null
}

type RawEvent = { time?: unknown; country?: unknown; currency?: unknown; event?: unknown; title?: unknown; impact?: unknown }

function toEvent(r: RawEvent): NewsEvent | null {
  const time = timeMs(r.time)
  if (time === null) return null
  const country = typeof r.country === 'string' ? r.country.toUpperCase() : ''
  const currency =
    typeof r.currency === 'string' && r.currency ? r.currency.toUpperCase() : (COUNTRY_CCY[country] ?? country)
  const title = typeof r.event === 'string' ? r.event : typeof r.title === 'string' ? r.title : 'Economic event'
  return { time, impact: impactOf(r.impact), currency, title }
}

/**
 * Defensively parse an economic-calendar payload into NewsEvent[]. Accepts a Finnhub-style
 * `{ economicCalendar: [...] }` object or a bare array; tolerates string or epoch times and
 * missing fields. Unparseable entries are skipped (never throws). Pure.
 */
export function parseEconomicCalendar(raw: unknown): NewsEvent[] {
  const list: unknown = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { economicCalendar?: unknown }).economicCalendar)
      ? (raw as { economicCalendar: unknown[] }).economicCalendar
      : null
  if (!Array.isArray(list)) return []
  const out: NewsEvent[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const ev = toEvent(item as RawEvent)
    if (ev) out.push(ev)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/edge/newsProvider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/edge/newsProvider.ts src/edge/newsProvider.test.ts
git commit -m "feat(edge): defensive economic-calendar payload parser"
```

---

### Task 2: Win-rate-by-grade stats (pure)

**Files:**
- Create: `src/sim/gradeStats.ts`
- Test: `src/sim/gradeStats.test.ts`

**Interfaces:**
- Consumes: `SimState` (`./types.js`), `Grade` (`../edge/scoreSetup.js`).
- Produces:
  - `type GradeStatRow = { grade: Grade; trades: number; wins: number; winRate: number; avgR: number; pnlCredits: number }`
  - `gradeStats(state: SimState): GradeStatRow[]` — one row per grade that has ≥1 trade, ordered A→F.

- [ ] **Step 1: Write the failing test**

```ts
// src/sim/gradeStats.test.ts
import { describe, expect, it } from 'vitest'
import { gradeStats } from './gradeStats'
import type { SimState, SimTrade } from './types'

const trade = (grade: 'A' | 'B', result: 'win' | 'loss'): SimTrade => ({
  id: 't', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2,
  openedAtTime: 0, grade, exit: result === 'win' ? 110 : 95, exitReason: result === 'win' ? 'tp' : 'sl',
  result, rMultiple: result === 'win' ? 2 : -1, pnlCredits: result === 'win' ? 4 : -2, closedAtTime: 1,
})

const state = (trades: SimTrade[]): SimState => ({
  startingBalance: 200, balance: 200, open: null, armed: true, nextId: 1, trades,
})

describe('gradeStats', () => {
  it('groups trades by grade with per-grade win rate and avg R, ordered A→F', () => {
    const rows = gradeStats(state([trade('A', 'win'), trade('A', 'loss'), trade('B', 'win')]))
    expect(rows.map((r) => r.grade)).toEqual(['A', 'B'])
    const a = rows[0]!
    expect(a.trades).toBe(2)
    expect(a.wins).toBe(1)
    expect(a.winRate).toBeCloseTo(0.5, 6)
    expect(a.avgR).toBeCloseTo(0.5, 6) // (2 + -1) / 2
    expect(a.pnlCredits).toBe(2) // 4 + (-2)
    expect(rows[1]!.grade).toBe('B')
  })

  it('returns [] when there are no graded trades', () => {
    expect(gradeStats(state([]))).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/gradeStats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/sim/gradeStats.ts
import type { SimState } from './types.js'
import type { Grade } from '../edge/scoreSetup.js'

export type GradeStatRow = {
  grade: Grade
  trades: number
  wins: number
  winRate: number
  avgR: number
  pnlCredits: number
}

const ORDER: Grade[] = ['A', 'B', 'C', 'D', 'F']

/** Per-grade record for the Claude account's closed trades. One row per grade present, A→F. */
export function gradeStats(state: SimState): GradeStatRow[] {
  const rows: GradeStatRow[] = []
  for (const grade of ORDER) {
    const ts = state.trades.filter((t) => t.grade === grade)
    if (ts.length === 0) continue
    const wins = ts.filter((t) => t.result === 'win').length
    const rSum = ts.reduce((a, t) => a + t.rMultiple, 0)
    const pnl = ts.reduce((a, t) => a + t.pnlCredits, 0)
    rows.push({
      grade,
      trades: ts.length,
      wins,
      winRate: wins / ts.length,
      avgR: rSum / ts.length,
      pnlCredits: pnl,
    })
  }
  return rows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/gradeStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/gradeStats.ts src/sim/gradeStats.test.ts
git commit -m "feat(sim): win-rate-by-grade stats for the Claude account"
```

---

### Task 3: Thread cached news through the sim tick

**Files:**
- Modify: `src/serverTick.ts` (`SimBlob` gains `news` + `newsFetchedAt`; `initBlob` seeds them; `planFetch` adds a `news` due-flag; `applyTick` accepts `fetched.news`, threads it into `evaluateSetupClaude`, and caches it).
- Test: `src/serverTick.test.ts`.

**Interfaces:**
- Consumes: `NewsEvent` (`./edge/newsWindow.js`).
- Produces: `NEWS_MS` constant; `SimBlob.news: NewsEvent[]` + `SimBlob.newsFetchedAt: number | null`; `planFetch(blob, now): { m15: boolean; h1: boolean; news: boolean }`; `applyTick(blob, { m5, m15?, h1?, news? }, config, now)`.

- [ ] **Step 1: Write the failing test**

Add to `src/serverTick.test.ts`:

```ts
import type { NewsEvent } from './edge/newsWindow'

it('initBlob seeds an empty news cache', () => {
  const blob = initBlob({ startingBalance: 200, riskPct: 0.01, contractSize: 100 })
  expect(blob.news).toEqual([])
  expect(blob.newsFetchedAt).toBeNull()
})

it('planFetch marks news due when never fetched', () => {
  const blob = initBlob({ startingBalance: 200, riskPct: 0.01, contractSize: 100 })
  expect(planFetch(blob, 1_000_000).news).toBe(true)
})

it('applyTick caches passed news and refreshes its timestamp', () => {
  const simConfig = { startingBalance: 200, riskPct: 0.01, contractSize: 100 }
  const now = 5_000_000
  const events: NewsEvent[] = [{ time: now, impact: 'high', currency: 'USD', title: 'FOMC' }]
  const out = applyTick(initBlob(simConfig), { m5: SAMPLE_M5, m15: SAMPLE_M15, h1: SAMPLE_H1, news: events }, defaultConfig, now)
  expect(out.news).toEqual(events)
  expect(out.newsFetchedAt).toBe(now)
})
```

> Reuse the existing sample fixtures in `serverTick.test.ts` (whatever it already calls its M5/M15/H1 arrays); rename `SAMPLE_*` to match. If the file builds contexts inline, mirror that.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/serverTick.test.ts`
Expected: FAIL — `blob.news` undefined / `planFetch(...).news` undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/serverTick.ts`:

Add the import and interval constant:

```ts
import type { NewsEvent } from './edge/newsWindow.js'
export const NEWS_MS = 30 * 60_000
```

Extend `SimBlob` (add the two fields) and `initBlob` (seed them):

```ts
// in SimBlob:
  news: NewsEvent[]
  newsFetchedAt: number | null
```
```ts
// in initBlob return object:
    news: [],
    newsFetchedAt: null,
```

Extend `planFetch`:

```ts
export function planFetch(blob: SimBlob, now: number): { m15: boolean; h1: boolean; news: boolean } {
  return {
    m15: isDue(M15_MS, blob.m15FetchedAt, now),
    h1: isDue(H1_MS, blob.h1FetchedAt, now),
    news: isDue(NEWS_MS, blob.newsFetchedAt, now),
  }
}
```

Update `applyTick` to accept and thread news:

```ts
export function applyTick(
  blob: SimBlob,
  fetched: { m5: Candle[]; m15?: Candle[]; h1?: Candle[]; news?: NewsEvent[] },
  config: Config,
  now: number,
): SimBlob {
  const m15 = fetched.m15 ?? blob.m15
  const h1 = fetched.h1 ?? blob.h1
  const news = fetched.news ?? blob.news
  const ctx: MarketContext = { m5: fetched.m5, m15, h1 }

  const dadSignal = verdictToSignal(evaluateSetup(ctx, config))
  const dad = advanceSim(blob.state, blob.lastProcessedTime, ctx, config, dadSignal)

  const claudeSignal = claudeVerdictToSignal(evaluateSetupClaude(ctx, config, now, news))
  const claude = advanceSim(blob.claudeState, blob.claudeLastProcessedTime, ctx, config, claudeSignal)

  return {
    ...blob,
    state: dad.state,
    lastProcessedTime: dad.lastProcessedTime,
    claudeState: claude.state,
    claudeLastProcessedTime: claude.lastProcessedTime,
    m15,
    h1,
    news,
    newsFetchedAt: fetched.news ? now : blob.newsFetchedAt,
    m15FetchedAt: fetched.m15 ? now : blob.m15FetchedAt,
    h1FetchedAt: fetched.h1 ? now : blob.h1FetchedAt,
    limitReachedAt: null,
    updatedAt: now,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/serverTick.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/serverTick.ts src/serverTick.test.ts
git commit -m "feat(sim): cache + thread economic-calendar news into the Claude tick"
```

---

### Task 4: API — fetch the calendar (keyed, graceful) and serve it

**Files:**
- Create: `api/_news.ts` (fetch helper).
- Modify: `api/sim-tick.ts` (fetch news when due AND a key exists; pass to `applyTick`).
- Modify: `api/sim-state.ts` (return `news` + `meta.newsUpdatedAt` + `newsActive`).

**Interfaces:**
- Produces: `fetchEconomicCalendar(now: number): Promise<NewsEvent[]>` in `api/_news.ts` — reads `NEWS_API_KEY` (+ optional `NEWS_PROVIDER`, default finnhub); returns `[]` on any error. Caller decides whether to fetch based on key presence + `planFetch(...).news`.
- Note: Vercel handlers aren't unit-tested here; verify via `npm run typecheck && npm run build`.

- [ ] **Step 1: Create `api/_news.ts`**

```ts
// api/_news.ts
import type { NewsEvent } from '../src/edge/newsWindow.js'
import { parseEconomicCalendar } from '../src/edge/newsProvider.js'

/** Whether a news provider key is configured (feed active). */
export function newsConfigured(): boolean {
  return Boolean(process.env.NEWS_API_KEY)
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Fetch the economic calendar for [now, now+2d] from the configured provider (Finnhub by
 * default). Returns [] on missing key or ANY error — the feed is best-effort and never throws.
 */
export async function fetchEconomicCalendar(now: number): Promise<NewsEvent[]> {
  const key = process.env.NEWS_API_KEY
  if (!key) return []
  const provider = process.env.NEWS_PROVIDER ?? 'finnhub'
  try {
    if (provider === 'finnhub') {
      const from = ymd(now)
      const to = ymd(now + 2 * 24 * 60 * 60_000)
      const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`
      const res = await fetch(url)
      if (!res.ok) return []
      return parseEconomicCalendar(await res.json())
    }
    return []
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Wire `api/sim-tick.ts`**

Add the import:

```ts
import { fetchEconomicCalendar, newsConfigured } from './_news.js'
```

In the `try` block, after computing `plan` and fetching candles, fetch news when due and configured, then pass it to `applyTick`:

```ts
    const plan = planFetch(blob, now)
    const m5 = await fetchCandles('5min', OUTPUT_SIZE)
    const m15 = plan.m15 ? await fetchCandles('15min', OUTPUT_SIZE) : undefined
    const h1 = plan.h1 ? await fetchCandles('1h', OUTPUT_SIZE) : undefined
    const news = plan.news && newsConfigured() ? await fetchEconomicCalendar(now) : undefined
    const next = applyTick(blob, { m5, m15, h1, news }, defaultConfig, now)
```

(No other change; `news === undefined` when not due/!configured leaves the cache intact via `applyTick`.)

- [ ] **Step 3: Wire `api/sim-state.ts`**

Add the import and extend the payload:

```ts
import { newsConfigured } from './_news.js'
```

```ts
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
  res.status(200).json({
    state: blob.state,
    claudeState: blob.claudeState,
    news: blob.news,
    meta: {
      limitReachedAt: blob.limitReachedAt,
      updatedAt: blob.updatedAt,
      newsUpdatedAt: blob.newsFetchedAt,
      newsActive: newsConfigured(),
    },
  })
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add api/_news.ts api/sim-tick.ts api/sim-state.ts
git commit -m "feat(api): pluggable economic-calendar fetch (off without NEWS_API_KEY) + serve news"
```

---

### Task 5: `useServerSim` exposes news + feed status

**Files:**
- Modify: `src/hooks/useServerSim.ts`.
- Test: `src/hooks/useServerSim.test.ts`.

**Interfaces:**
- Consumes: `NewsEvent` (`../edge/newsWindow.js`).
- Produces: `SimMeta` gains `newsUpdatedAt: number | null` and `newsActive: boolean`; `UseServerSim` gains `news: NewsEvent[]`.

- [ ] **Step 1: Write the failing test**

Add to `src/hooks/useServerSim.test.ts` (and add `news` + the new meta fields to the `beforeEach` fetch mock payload):

```ts
it('exposes news events and feed-active status', async () => {
  const { result } = renderHook(() => useServerSim())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(Array.isArray(result.current.news)).toBe(true)
  expect(result.current.meta).toHaveProperty('newsActive')
})
```

> Update the `beforeEach` mock `json` to include `news: []` and `meta: { limitReachedAt: null, updatedAt: 123, newsUpdatedAt: null, newsActive: false }`. Keep existing assertions valid.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useServerSim.test.ts`
Expected: FAIL — `news` / `meta.newsActive` absent.

- [ ] **Step 3: Write minimal implementation**

In `src/hooks/useServerSim.ts`: extend `SimMeta`, `UseServerSim`, `EMPTY_META`, the parsed shape, a `news` state, and the return.

```ts
import type { NewsEvent } from '../edge/newsWindow'
```
```ts
export type SimMeta = { limitReachedAt: number | null; updatedAt: number | null; newsUpdatedAt: number | null; newsActive: boolean }
export type UseServerSim = {
  state: SimState; stats: SimStats
  claudeState: SimState; claudeStats: SimStats
  news: NewsEvent[]; meta: SimMeta; loading: boolean
}
const EMPTY_META: SimMeta = { limitReachedAt: null, updatedAt: null, newsUpdatedAt: null, newsActive: false }
```

Add `const [news, setNews] = useState<NewsEvent[]>([])`, parse `json.news`, set it in the success branch, and include `news` in the returned object:

```ts
        const json = (await res.json()) as { state?: SimState; claudeState?: SimState; news?: NewsEvent[]; meta?: SimMeta }
        if (alive && json.state) {
          setState(json.state)
          if (json.claudeState) setClaudeState(json.claudeState)
          if (json.news) setNews(json.news)
          setMeta(json.meta ?? EMPTY_META)
        }
```
```ts
  return { state, stats: simStats(state), claudeState, claudeStats: simStats(claudeState), news, meta, loading }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useServerSim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useServerSim.ts src/hooks/useServerSim.test.ts
git commit -m "feat(hooks): expose news events + feed-active status"
```

---

### Task 6: Client Signal uses real news + a feed-status indicator

**Files:**
- Modify: `src/App.tsx` (pass `sim.news` into the client-side `evaluateSetupClaude`; render a small news-feed status chip in the Claude Signal section).
- Test: `src/App.test.tsx` (assert the news-status chip renders).

**Interfaces:**
- Consumes: `sim.news`, `sim.meta.newsActive` from `useServerSim`.

- [ ] **Step 1: Write the failing test**

Add to `src/App.test.tsx` (Signal is the default tab):

```ts
it('shows the news-feed status on the Signal tab', () => {
  render(<App />)
  expect(screen.getByText(/news feed/i)).toBeInTheDocument()
})
```

> The `useServerSim` fetch is mocked in this suite (or returns empty); with `newsActive: false` the chip reads "News feed: off". Ensure the mock/default yields a defined `meta.newsActive` (the hook's `EMPTY_META` already defaults it to `false`, so no data means "off").

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — no "news feed" text.

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, change the client verdict to use server news (line ~175):

```tsx
const claudeVerdict = activeCtx ? evaluateSetupClaude(activeCtx, activeConfig, now, sim.news) : null
```

In the Signal tab's Claude `StrategySection`, add a status chip above `<ClaudeSignal .../>`:

```tsx
<StrategySection engine="claude" subtitle="my criteria">
  <div className="mb-2 inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface-sunken px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-3">
    <span className={`h-1.5 w-1.5 rounded-full ${sim.meta.newsActive ? 'bg-pass-fg' : 'bg-ink-3'}`} />
    News feed: {sim.meta.newsActive ? 'on' : 'off'}
  </div>
  {claudeVerdict ? (
    <ClaudeSignal verdict={claudeVerdict} />
  ) : (
    <p className="text-[12.5px] text-ink-3">Waiting for candles…</p>
  )}
</StrategySection>
```

> `sim` is the `useServerSim()` result already in scope in `App` (used by the Paper tab). Confirm the variable name (`sim`) matches the existing code and reuse it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(ui): Signal uses server news + shows feed on/off status"
```

---

### Task 7: `GradeAnalytics` panel in the Paper tab

**Files:**
- Create: `src/ui/edge/GradeAnalytics.tsx`
- Test: `src/ui/edge/GradeAnalytics.test.tsx`
- Modify: `src/App.tsx` (render `GradeAnalytics` under the Claude `SimPanel` on the Paper tab).

**Interfaces:**
- Consumes: `gradeStats` (`../../sim/gradeStats.js`), `SimState` (`../../sim/types.js`).
- Produces: `GradeAnalytics({ state }: { state: SimState }): ReactElement` — renders the by-grade rows; shows an empty hint when there are no graded trades yet.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/edge/GradeAnalytics.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GradeAnalytics } from './GradeAnalytics'
import type { SimState, SimTrade } from '../../sim/types'

const win = (grade: 'A' | 'B'): SimTrade => ({
  id: 't', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2,
  openedAtTime: 0, grade, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 4, closedAtTime: 1,
})
const state = (trades: SimTrade[]): SimState => ({ startingBalance: 200, balance: 200, open: null, armed: true, nextId: 1, trades })

describe('GradeAnalytics', () => {
  it('renders a row per graded bucket with its win rate', () => {
    render(<GradeAnalytics state={state([win('A'), win('B')])} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getAllByText(/100%/).length).toBeGreaterThan(0)
  })
  it('shows an empty hint with no graded trades', () => {
    render(<GradeAnalytics state={state([])} />)
    expect(screen.getByText(/no graded trades yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/edge/GradeAnalytics.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/edge/GradeAnalytics.tsx
import type { ReactElement } from 'react'
import type { SimState } from '../../sim/types.js'
import { gradeStats } from '../../sim/gradeStats.js'

/** Realized win-rate / avg-R / P&L per pre-trade grade for the Claude account. */
export function GradeAnalytics({ state }: { state: SimState }): ReactElement {
  const rows = gradeStats(state)
  return (
    <div className="mt-4 rounded-panel border border-border bg-surface p-4 shadow-panel">
      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.05em] text-ink">Win rate by grade</h3>
      {rows.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-3">No graded trades yet — analytics fill in as the Claude engine trades.</p>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
              <th className="pb-1.5 font-semibold">Grade</th>
              <th className="pb-1.5 text-right font-semibold">Trades</th>
              <th className="pb-1.5 text-right font-semibold">Win rate</th>
              <th className="pb-1.5 text-right font-semibold">Avg R</th>
              <th className="pb-1.5 text-right font-semibold">P&L</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map((r) => (
              <tr key={r.grade} className="border-t border-border">
                <td className="py-1.5 font-sans font-bold text-brand">{r.grade}</td>
                <td className="py-1.5 text-right text-ink-2">{r.trades}</td>
                <td className="py-1.5 text-right text-ink">{Math.round(r.winRate * 100)}%</td>
                <td className={`py-1.5 text-right ${r.avgR >= 0 ? 'text-pass-fg' : 'text-fail-fg'}`}>
                  {r.avgR >= 0 ? '+' : '−'}
                  {Math.abs(r.avgR).toFixed(2)}R
                </td>
                <td className={`py-1.5 text-right ${r.pnlCredits >= 0 ? 'text-pass-fg' : 'text-fail-fg'}`}>
                  {r.pnlCredits >= 0 ? '+' : '−'}${Math.abs(r.pnlCredits).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/edge/GradeAnalytics.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire into the Paper tab and run the full gate**

In `src/App.tsx`, import and render it under the Claude `SimPanel` on the Paper tab:

```tsx
import { GradeAnalytics } from './ui/edge/GradeAnalytics'
```
```tsx
<StrategySection engine="claude" subtitle="my criteria">
  <SimPanel state={sim.claudeState} stats={sim.claudeStats} meta={sim.meta} />
  <GradeAnalytics state={sim.claudeState} />
</StrategySection>
```

Run: `npm run typecheck && npx vitest run && npm run lint && npm run build`
Expected: all green, 0 lint warnings.

- [ ] **Step 6: Commit**

```bash
git add src/ui/edge/GradeAnalytics.tsx src/ui/edge/GradeAnalytics.test.tsx src/App.tsx
git commit -m "feat(ui): win-rate-by-grade analytics under the Claude Paper panel"
```

---

## Self-Review

**Spec coverage (Phase 3 scope):**
- Real economic-calendar news feed → Tasks 1, 3, 4. ✓
- Cached server-side → Tasks 3, 4. ✓
- Graceful degradation / off by default → Task 4 (`fetchEconomicCalendar` returns [] on no key/error; `newsConfigured()` gate) + Task 6 (on/off indicator). ✓
- Same events feed sim AND client Signal → Tasks 4 (serve), 5 (expose), 6 (client uses `sim.news`). ✓
- Win-rate-by-grade analytics → Tasks 2, 7. ✓
- Grade tagging already landed in Phase 2 — consumed here. ✓
- Chart markers still deferred (documented). ✓

**Placeholder scan:** No TBD/TODO. `>` notes are verification instructions naming exact files (reuse fixtures, confirm variable names).

**Type consistency:** `NewsEvent` (from `edge/newsWindow`) is produced by `parseEconomicCalendar` (Task 1) and `fetchEconomicCalendar` (Task 4), cached on `SimBlob.news` (Task 3), served by `sim-state` (Task 4), exposed as `UseServerSim.news` (Task 5), and consumed by `App`'s `evaluateSetupClaude` (Task 6). `GradeStatRow`/`gradeStats` (Task 2) consumed by `GradeAnalytics` (Task 7). `SimMeta` gains `newsUpdatedAt`/`newsActive` in Task 5 to match the `sim-state` payload in Task 4. `planFetch` return type gains `news` (Task 3) consumed in `sim-tick` (Task 4).

## Notes for the executor
- To ACTIVATE the feed after merge: set `NEWS_API_KEY` (and optionally `NEWS_PROVIDER=finnhub`) in Vercel env. Until then the feed is off and the veto is inactive by design — the indicator reads "News feed: off".
- The Finnhub economic-calendar endpoint may require a paid plan; the adapter is provider-agnostic (`parseEconomicCalendar` is defensive) so another provider can be swapped by editing only `api/_news.ts`.
- Keep NodeNext `.js` imports. Final gate: `npm run typecheck && npm run test:run && npm run lint && npm run build`.
