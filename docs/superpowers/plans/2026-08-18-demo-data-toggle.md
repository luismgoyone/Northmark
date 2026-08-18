# Demo Data Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Owner for both tasks:
> `frontend-engineer` (this is UI + demo data; the engine is NOT touched). Each task ends in a
> commit; `quant-reviewer` is NOT needed (no gate/scoring logic changes).

**Goal:** A local demo mode that feeds the deterministic engine canned `MarketContext` fixtures so
the full pipeline (checklist → score → trade card) can be exercised on demand, with an
unmistakable "DEMO — not a live signal" treatment. No AI, no new integration, no engine change.

**Architecture:** App gains a `mode` selector. `'live'` uses `useMarketData()` (today). A demo
preset supplies a canned `ctx` and pauses live polling. `evaluateSetup(ctx, config)` and every
downstream component are unchanged.

**Tech Stack:** React 18 + Vite + TS strict, Vitest, Tailwind. No new deps.

## Global Constraints

- **No engine changes** — do not modify `src/gates/*`, `src/scoring/*`, `src/indicators/*`.
- **`src/` must not import from `tests/`** — port the candle builders into `src/demo/`.
- **Honesty invariants (hard):** Live is the default on load; whenever `mode !== 'live'` BOTH the
  DEMO banner is visible AND the DemoSwitch shows its amber DEMO state; banner copy states the data
  is **not a live signal**; **no BUY button** in any mode.
- **TS strict + `noUncheckedIndexedAccess`.**
- Reuse existing design tokens (the amber "build" tokens already used by TradeCard's "Provisional"
  badge) — do not invent new colors.
- Commit per task.

## File Structure

```
src/
├─ demo/
│  ├─ candles.ts          # NEW — ported candle builders (bar, trendSeries, rangeSeries, fullNarrative)
│  ├─ presets.ts          # NEW — DEMO_PRESETS + Mode/DemoMode types
│  └─ presets.test.ts     # NEW — pins each preset to evaluateSetup behavior
├─ ui/
│  ├─ DemoSwitch.tsx      # NEW — header control (Live + 3 presets)
│  ├─ DemoSwitch.test.tsx # NEW
│  └─ DemoBanner.tsx      # NEW — amber "not a live signal" banner
├─ hooks/useMarketData.ts # MODIFY — additive `enabled` arg (default true)
└─ App.tsx                # MODIFY — mode state, ctx selection, render switch + banner
```

---

## Task 1: Demo presets + candle builders (data layer)

**Files:**
- Create: `src/demo/candles.ts`
- Create: `src/demo/presets.ts`
- Test: `src/demo/presets.test.ts`

**Interfaces:**
- Consumes: `Candle`, `MarketContext` from `src/types`; `evaluateSetup` + `defaultConfig` (test only).
- Produces:
  - `src/demo/candles.ts`: `bar`, `trendSeries('up'|'down', legs?)`, `rangeSeries(count?)`, `fullNarrative()` — **ported verbatim** from the proven fixtures (see below), so `src/` no longer depends on `tests/`.
  - `src/demo/presets.ts`: `export type DemoMode = 'demo-setup' | 'demo-building' | 'demo-wait'`; `export type Mode = 'live' | DemoMode`; `export type DemoPreset = { id: DemoMode; label: string; ctx: MarketContext }`; `export const DEMO_PRESETS: DemoPreset[]`.

- [ ] **Step 1: Port the candle builders** into `src/demo/candles.ts`. Copy `bar`, `trendSeries`, and `rangeSeries` verbatim from `tests/fixtures/structureSeries.ts`, and `fullNarrative` verbatim from `src/scoring/evaluateSetup.test.ts` (lines 13–45). Export all four. These are pure data builders — no logic. Exact `fullNarrative` body to use:

```ts
import type { Candle } from '../types'

export function bar(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c }
}

/** A clean up/down staircase whose swing highs AND lows strictly trend (from structureSeries.ts). */
export function trendSeries(direction: 'up' | 'down', legs = 4): Candle[] {
  // PORT the exact current body of trendSeries from tests/fixtures/structureSeries.ts.
}

/** A flat, overlapping range: no directional progression (from structureSeries.ts). */
export function rangeSeries(count = 20): Candle[] {
  // PORT the exact current body of rangeSeries from tests/fixtures/structureSeries.ts.
}

/** Hand-built long narrative that drives evaluateSetup to a full authorized setup. */
export function fullNarrative(): Candle[] {
  return [
    bar(0, 2085, 2087, 2083, 2085),
    bar(1, 2088, 2090, 2086, 2088),
    bar(2, 2090, 2095, 2088, 2093),
    bar(3, 2095, 2100, 2093, 2098), // H: swing high 2100
    bar(4, 2097, 2096, 2093, 2094),
    bar(5, 2094, 2094, 2090, 2091),
    bar(6, 2091, 2093, 2089, 2090),
    bar(7, 2090, 2092, 2088, 2089),
    bar(8, 2099, 2108, 2098, 2107), // breakout: close 2107 > 2100 + 0.20
    bar(9, 2104, 2105, 2099.5, 2101), // retest: low touches band, close holds ≥ 2100
    bar(10, 2101, 2109, 2100.5, 2107), // confirmation: bullish, upper third
    bar(11, 2107, 2108, 2104, 2105), // trailing (not a confirmation candle)
  ]
}
```
> To port `trendSeries`/`rangeSeries`, open `tests/fixtures/structureSeries.ts` and copy their
> current bodies exactly (they are the versions all Phase-2 tests rely on). Do not re-derive.

- [ ] **Step 2: Write the presets** in `src/demo/presets.ts`:

```ts
import type { MarketContext } from '../types'
import { fullNarrative, rangeSeries, trendSeries } from './candles'

export type DemoMode = 'demo-setup' | 'demo-building' | 'demo-wait'
export type Mode = 'live' | DemoMode
export type DemoPreset = { id: DemoMode; label: string; ctx: MarketContext }

// Each preset reuses fixtures already proven (in evaluateSetup.test.ts) to drive the engine to
// the intended verdict — see presets.test.ts, which pins them so they can't silently drift.
export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'demo-setup',
    label: 'Authorized LONG setup',
    // fullNarrative M5 + clean long structure on M15/H1 → status 'setup', direction 'long'.
    ctx: { m5: fullNarrative(), m15: trendSeries('up', 6), h1: trendSeries('up', 6) },
  },
  {
    id: 'demo-building',
    label: 'Building — blocked at retest',
    // A monotonic uptrend: breaks a level but never pulls back to hold the retest → wait@retest.
    ctx: { m5: trendSeries('up', 6), m15: trendSeries('up', 6), h1: trendSeries('up', 6) },
  },
  {
    id: 'demo-wait',
    label: 'WAIT — H1 bias unclear',
    // A flat range → H1 direction unclear → wait@h1-m15-bias (the live-like empty state).
    ctx: { m5: rangeSeries(), m15: rangeSeries(), h1: rangeSeries() },
  },
]
```

- [ ] **Step 3: Write the anti-drift test** `src/demo/presets.test.ts` (RED first — the files above make it pass):

```ts
import { describe, expect, it } from 'vitest'
import { evaluateSetup } from '../scoring/evaluateSetup'
import { defaultConfig } from '../config'
import { DEMO_PRESETS } from './presets'

const byId = (id: string) => DEMO_PRESETS.find((p) => p.id === id)!

describe('DEMO_PRESETS drive the engine to their intended verdicts', () => {
  it('demo-setup → an authorized LONG setup', () => {
    const v = evaluateSetup(byId('demo-setup').ctx, defaultConfig)
    expect(v.status).toBe('setup')
    if (v.status === 'setup') {
      expect(v.direction).toBe('long')
      expect(v.score.authorized).toBe(true)
      expect(v.lot).toBeGreaterThan(0)
    }
  })
  it('demo-building → WAIT blocked at retest', () => {
    const v = evaluateSetup(byId('demo-building').ctx, defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') expect(v.blockedBy).toBe('retest')
  })
  it('demo-wait → WAIT blocked at h1-m15-bias', () => {
    const v = evaluateSetup(byId('demo-wait').ctx, defaultConfig)
    expect(v.status).toBe('wait')
    if (v.status === 'wait') expect(v.blockedBy).toBe('h1-m15-bias')
  })
  it('exposes exactly the three presets with stable ids', () => {
    expect(DEMO_PRESETS.map((p) => p.id)).toEqual(['demo-setup', 'demo-building', 'demo-wait'])
  })
})
```

- [ ] **Step 4: Run → RED then GREEN.** `npx vitest run src/demo/presets.test.ts`. If a preset's verdict is not as asserted, the fixture port is wrong (re-copy the exact builder body) — do NOT change the assertions or the engine. Then `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat: add demo-mode presets pinned to engine verdicts`.

---

## Task 2: Demo switch, banner, and App wiring (UI)

**Files:**
- Create: `src/ui/DemoSwitch.tsx`, `src/ui/DemoSwitch.test.tsx`, `src/ui/DemoBanner.tsx`
- Modify: `src/hooks/useMarketData.ts`, `src/App.tsx`, `src/App.test.tsx`
- Test: extend `src/hooks/useMarketData.test.ts`

**Interfaces:**
- Consumes: `Mode`, `DemoMode`, `DemoPreset`, `DEMO_PRESETS` (Task 1); existing `useMarketData`, `evaluateSetup`, UI components.
- Produces: `DemoSwitch({ value: Mode; onChange: (m: Mode) => void })`; `DemoBanner({ onExit: () => void })`; `useMarketData(enabled?: boolean)`.

- [ ] **Step 1: Add an `enabled` arg to `useMarketData`** (additive; default preserves behavior). Change the signature to `useMarketData(enabled: boolean = true)`; at the very top of the effect body, `if (!enabled) return` (so no fetch and no timers are scheduled when disabled); add `enabled` to the effect dependency array so toggling re-runs it (its cleanup already clears timers). No other logic changes.

- [ ] **Step 2: Extend `useMarketData.test.ts`** — add:

```ts
it('does not fetch or schedule timers when disabled', async () => {
  renderHook(() => useMarketData(false))
  await flushPromises()
  expect(mockFetch).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000) })
  expect(mockFetch).not.toHaveBeenCalled()
})
```
Run `npx vitest run src/hooks/useMarketData.test.ts` → this fails (RED) before Step 1's change is in, passes after. (Existing tests, which call `useMarketData()` with no arg, must stay green — the default `true` guarantees it.)

- [ ] **Step 3: Build `DemoBanner.tsx`** — a full-width amber banner using the existing build tokens (same family as TradeCard's "Provisional" badge: `border-build-bd bg-build-bg text-build-fg`):

```tsx
import type { ReactElement } from 'react'

export function DemoBanner({ onExit }: { onExit: () => void }): ReactElement {
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-panel border border-build-bd bg-build-bg px-4 py-2.5 text-[12.5px] font-semibold text-build-fg"
    >
      <svg aria-hidden="true" width={15} height={15} viewBox="0 0 24 24" fill="none">
        <path d="M12 3 2 21h20L12 3Z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
        <path d="M12 10v4M12 17.5v.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
      DEMO DATA — illustrative only, not a live signal.
      <button type="button" onClick={onExit} className="underline underline-offset-2 hover:no-underline">
        Switch to Live
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Build `DemoSwitch.tsx`** — a labeled `<select>` in the header; amber when a demo preset is active, neutral for Live:

```tsx
import type { ReactElement } from 'react'
import { DEMO_PRESETS, type Mode } from '../demo/presets'

export function DemoSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }): ReactElement {
  const isDemo = value !== 'live'
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]">
      <span className="text-ink-3">Data</span>
      <select
        aria-label="Data source"
        value={value}
        onChange={(e) => onChange(e.target.value as Mode)}
        className={`rounded-chip border px-2 py-1 text-[11px] ${
          isDemo ? 'border-build-bd bg-build-bg text-build-fg' : 'border-border bg-surface text-ink-2'
        }`}
      >
        <option value="live">Live</option>
        {DEMO_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>{`Demo · ${p.label}`}</option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 5: Wire `App.tsx`.** Add `const [mode, setMode] = useState<Mode>('live')`. Call `useMarketData(mode === 'live')`. Compute the ctx:

```tsx
const demoPreset = mode === 'live' ? null : DEMO_PRESETS.find((p) => p.id === mode) ?? null
const activeCtx = demoPreset ? demoPreset.ctx : ctx
```
Render `<DemoSwitch value={mode} onChange={setMode} />` in the `Header` (next to the theme toggle — thread it through or render alongside). When `mode !== 'live'`, render `<DemoBanner onExit={() => setMode('live')} />` just below the header. **Ctx selection for the render gate:** in demo mode, skip the loading/error early-return entirely (demo data is synchronous) — branch so that when `demoPreset` is set you go straight to the dashboard using `activeCtx`; only the `mode === 'live'` path keeps the existing `if (!ctx) { loading/error }` gate. Everywhere the dashboard currently uses `ctx`, use `activeCtx`. Unknown preset id falls back to Live (the `?? null` above → treated as live).

- [ ] **Step 6: Extend `App.test.tsx`** — behavioral:
  - default render is Live: no element with the DEMO banner text; existing Live assertions unchanged.
  - selecting the `demo-setup` option (change the "Data source" select) renders the DEMO banner AND a populated Trade Card (assert a trade-card metric like "Lot Size" appears, or the LONG chip); still **no button with an accessible name matching /buy|order|execute/i**.
  - after switching to a demo preset, selecting Live again removes the banner.
  (Use Testing Library: `getByLabelText('Data source')` + `fireEvent.change`.)

- [ ] **Step 7: Verify.** `npm run typecheck` (clean), `npx vitest run` (all green), `npm run build` (succeeds). Then DRIVE it (the `run` skill or `npm run dev`): default is Live; pick "Demo · Authorized LONG setup" → amber banner + all 8 checklist rows green + Score authorized + Trade Card populated; "Building" → partial checklist, WAIT at retest; "WAIT" → empty state; back to Live → banner gone, polling resumes. Confirm no BUY button in any mode.
- [ ] **Step 8: Commit** — `feat: demo data toggle — switch, banner, App wiring (pauses live polling)`.

---

## Self-Review

**Spec coverage:** presets (3, pinned) → Task 1; DemoSwitch/DemoBanner/App/`enabled`-polling-pause →
Task 2; honesty invariants (Live default, banner+switch together, "not a live signal", no BUY) →
Task 2 Steps 3–6 + App.test assertions. No-engine-change + no tests-import → Task 1 (ported builders).

**Placeholder scan:** the only "port the exact body" placeholders are the two builders whose current
source is named precisely (`tests/fixtures/structureSeries.ts`) — deliberate, to avoid transcribing a
long body that could drift; `fullNarrative` is given verbatim. No other TBDs.

**Type consistency:** `Mode`/`DemoMode`/`DemoPreset`/`DEMO_PRESETS` defined in Task 1, consumed by
name in Task 2. `useMarketData(enabled?: boolean)` new signature defined in Task 2 Step 1 before App
(Step 5) calls it. Preset ids (`demo-setup`/`demo-building`/`demo-wait`) match between presets.ts,
the test, and the switch options.
