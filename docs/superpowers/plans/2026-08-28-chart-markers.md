# Per-Engine Chart Markers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay each engine's paper-trading activity on the Chart tab — entry markers for past trades (colored by win/loss, labeled by engine + grade) and horizontal entry/SL/TP lines for any currently-open position.

**Architecture:** A pure `chartOverlays.ts` reduces the two engines' `SimState` into semantic marker/line descriptors (no colors). `PriceChart` maps those to lightweight-charts markers (merged with the existing swing markers) and `createPriceLine` levels, gated to Live mode (markers additionally to the M5 timeframe). `App` passes the sim states + live flag and renders a legend. All new `PriceChart` props are optional so existing behavior is unchanged when absent.

**Tech Stack:** TypeScript (strict, NodeNext ESM — `.js` imports), React 18, lightweight-charts v5, Tailwind, Vitest.

## Global Constraints

- Additive/non-breaking: new `PriceChart` props are OPTIONAL; absent → chart identical to today.
- Overlays render ONLY when `live` is true. Trade markers additionally ONLY when the timeframe is `M5` (trade times align to M5 candles). In Demo mode: no overlays.
- Pure `chartOverlays.ts`: no colors, no DOM, no clock — semantic fields only (`engine`, `direction`, `result`, `grade`, `kind`, `price`, `time`). Colors are applied in `PriceChart` so theme-flip re-coloring keeps working.
- Marker times use `toSec` (from `chartData.ts`, `Math.floor(ms/1000)`) so they match the candle series exactly. A trade marker is emitted only if its `toSec(openedAtTime)` matches a loaded candle (`candleSecs` set).
- Engine/sim/api untouched. NodeNext `.js` imports. Final gate: `npm run typecheck && npm run test:run && npm run lint && npm run build` (0 lint warnings; eslint runs `--max-warnings 0`, incl. `react-hooks/exhaustive-deps`).
- Reference: `src/ui/PriceChart.tsx`, `src/ui/chartData.ts` (`toSec`, `SwingMarker`, `toSwingMarkers`), `src/sim/types.ts` (`SimState`/`SimPosition`), `src/edge/scoreSetup.ts` (`Grade`), `src/App.tsx` (Chart tab, `sim`, `mode`).

---

### Task 1: Pure overlay reducer

**Files:**
- Modify: `src/ui/chartData.ts` (export `toSec`).
- Create: `src/ui/chartOverlays.ts`
- Test: `src/ui/chartOverlays.test.ts`

**Interfaces:**
- Consumes: `Direction` (`../types.js`), `SimState` (`../sim/types.js`), `Grade` (`../edge/scoreSetup.js`), `toSec` (`./chartData.js`).
- Produces:
  - `type EngineKey = 'dad' | 'claude'`
  - `type TradeMarker = { time: number; engine: EngineKey; direction: Direction; result: 'win' | 'loss'; grade?: Grade }`
  - `type PositionLine = { engine: EngineKey; direction: Direction; kind: 'entry' | 'sl' | 'tp'; price: number; grade?: Grade }`
  - `buildTradeMarkers(dad: SimState, claude: SimState, candleSecs: Set<number>): TradeMarker[]`
  - `buildPositionLines(dad: SimState, claude: SimState): PositionLine[]`

- [ ] **Step 1: Export `toSec`**

In `src/ui/chartData.ts`, change `const toSec = (ms: number): ChartTime => Math.floor(ms / 1000)` to:

```ts
export const toSec = (ms: number): ChartTime => Math.floor(ms / 1000)
```

- [ ] **Step 2: Write the failing test**

```ts
// src/ui/chartOverlays.test.ts
import { describe, expect, it } from 'vitest'
import { buildTradeMarkers, buildPositionLines } from './chartOverlays'
import type { SimState, SimTrade, SimPosition } from '../sim/types'

const T = 1_800_000_000_000 // epoch ms
const sec = Math.floor(T / 1000)

const trade = (over: Partial<SimTrade>): SimTrade => ({
  id: 't', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2,
  openedAtTime: T, exit: 110, exitReason: 'tp', result: 'win', rMultiple: 2, pnlCredits: 4, closedAtTime: T + 1000,
  ...over,
})
const pos = (over: Partial<SimPosition>): SimPosition => ({
  id: 'p', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2, openedAtTime: T, ...over,
})
const state = (over: Partial<SimState>): SimState => ({
  startingBalance: 200, balance: 200, open: null, armed: true, nextId: 1, trades: [], ...over,
})

describe('buildTradeMarkers', () => {
  it('emits a marker per trade whose openedAtTime matches a loaded candle, tagged by engine', () => {
    const dad = state({ trades: [trade({ result: 'loss', exitReason: 'sl' })] })
    const claude = state({ trades: [trade({ grade: 'A' })] })
    const markers = buildTradeMarkers(dad, claude, new Set([sec]))
    expect(markers).toHaveLength(2)
    expect(markers.find((m) => m.engine === 'dad')).toMatchObject({ time: sec, result: 'loss', direction: 'long' })
    expect(markers.find((m) => m.engine === 'claude')).toMatchObject({ time: sec, result: 'win', grade: 'A' })
  })

  it('drops trades whose time is not in the candle set', () => {
    const dad = state({ trades: [trade({})] })
    expect(buildTradeMarkers(dad, state({}), new Set([sec + 999]))).toHaveLength(0)
  })
})

describe('buildPositionLines', () => {
  it('emits entry/sl/tp lines for each engine open position', () => {
    const dad = state({ open: pos({ direction: 'short', entry: 200, sl: 205, tp: 190 }) })
    const claude = state({ open: pos({ grade: 'B' }) })
    const lines = buildPositionLines(dad, claude)
    expect(lines.filter((l) => l.engine === 'dad').map((l) => l.kind).sort()).toEqual(['entry', 'sl', 'tp'])
    expect(lines.find((l) => l.engine === 'dad' && l.kind === 'sl')?.price).toBe(205)
    expect(lines.find((l) => l.engine === 'claude' && l.kind === 'entry')?.grade).toBe('B')
  })

  it('returns [] when neither engine has an open position', () => {
    expect(buildPositionLines(state({}), state({}))).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/ui/chartOverlays.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/ui/chartOverlays.ts
import type { Direction } from '../types.js'
import type { SimState } from '../sim/types.js'
import type { Grade } from '../edge/scoreSetup.js'
import { toSec } from './chartData.js'

export type EngineKey = 'dad' | 'claude'
export type TradeMarker = { time: number; engine: EngineKey; direction: Direction; result: 'win' | 'loss'; grade?: Grade }
export type PositionLine = { engine: EngineKey; direction: Direction; kind: 'entry' | 'sl' | 'tp'; price: number; grade?: Grade }

function markersFor(state: SimState, engine: EngineKey, candleSecs: Set<number>): TradeMarker[] {
  const out: TradeMarker[] = []
  for (const t of state.trades) {
    const time = toSec(t.openedAtTime)
    if (!candleSecs.has(time)) continue
    out.push({ time, engine, direction: t.direction, result: t.result, grade: t.grade })
  }
  return out
}

/** Entry markers for both engines' closed trades that land on a loaded candle. Pure. */
export function buildTradeMarkers(dad: SimState, claude: SimState, candleSecs: Set<number>): TradeMarker[] {
  return [...markersFor(dad, 'dad', candleSecs), ...markersFor(claude, 'claude', candleSecs)].sort((a, b) => a.time - b.time)
}

function linesFor(state: SimState, engine: EngineKey): PositionLine[] {
  const p = state.open
  if (!p) return []
  const base = { engine, direction: p.direction, grade: p.grade }
  return [
    { ...base, kind: 'entry', price: p.entry },
    { ...base, kind: 'sl', price: p.sl },
    { ...base, kind: 'tp', price: p.tp },
  ]
}

/** Entry/SL/TP lines for each engine's currently-open position (if any). Pure. */
export function buildPositionLines(dad: SimState, claude: SimState): PositionLine[] {
  return [...linesFor(dad, 'dad'), ...linesFor(claude, 'claude')]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/chartOverlays.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/chartData.ts src/ui/chartOverlays.ts src/ui/chartOverlays.test.ts
git commit -m "feat(ui): pure chart-overlay reducer (trade markers + position lines)"
```

---

### Task 2: Render overlays in `PriceChart`

**Files:**
- Modify: `src/ui/PriceChart.tsx`
- Test: `src/ui/PriceChart.test.tsx` (extend the lightweight-charts mock with `createPriceLine`; assert overlays render).

**Interfaces:**
- Consumes: `SimState` (`../sim/types.js`), `buildTradeMarkers`, `buildPositionLines`, `toSec` (`./chartOverlays.js` / `./chartData.js`).
- Produces: `PriceChart` gains optional props `dadState?: SimState`, `claudeState?: SimState`, `live?: boolean`.

- [ ] **Step 1: Write the failing test**

Extend `src/ui/PriceChart.test.tsx`:

1. In the `vi.hoisted` block, add a `createPriceLineMock` and include it on the object `addSeriesMock` returns:

```ts
const createPriceLineMock = vi.fn()
const addSeriesMock = vi.fn(() => ({ setData: setDataMock, applyOptions: vi.fn(), createPriceLine: createPriceLineMock }))
// ...return it too so tests can assert on it
```
(Add `createPriceLineMock` to the returned object and clear it in `beforeEach`.)

2. Add a test that an open position draws price lines in live M5:

```ts
import type { SimState } from '../sim/types'
const openState: SimState = {
  startingBalance: 200, balance: 200, armed: false, nextId: 2, trades: [],
  open: { id: 'p1', direction: 'long', entry: 100, sl: 95, tp: 110, riskCredits: 2, lot: 0.1, rr: 2, openedAtTime: 60_000 },
}

it('draws position price lines when live with an open position', () => {
  render(<PriceChart {...props} live dadState={openState} claudeState={{ ...openState, open: null }} />)
  // entry + sl + tp = 3 lines for the one open (dad) position
  expect(createPriceLineMock).toHaveBeenCalledTimes(3)
})

it('draws no overlays when not live', () => {
  render(<PriceChart {...props} live={false} dadState={openState} claudeState={openState} />)
  expect(createPriceLineMock).not.toHaveBeenCalled()
})
```

> Keep the existing PriceChart tests intact; they call `<PriceChart {...props} />` with no overlay props and must still pass (props optional).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/PriceChart.test.tsx`
Expected: FAIL — `createPriceLine` not called / not a function.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/PriceChart.tsx`:

Add imports:
```ts
import type { SimState } from '../sim/types'
import { buildTradeMarkers, buildPositionLines, type TradeMarker } from './chartOverlays'
```

Extend `Props` and the component signature:
```ts
type Props = {
  ctx: MarketContext
  emaPeriod: number
  stoch: { k: number; d: number; smooth: number }
  dadState?: SimState
  claudeState?: SimState
  live?: boolean
}

export function PriceChart({ ctx, emaPeriod, stoch, dadState, claudeState, live = false }: Props): ReactElement {
```

Inside the `useEffect`, AFTER `candleSeries.setData(...)`, add the position lines (any tf, live only):
```ts
    if (live && dadState && claudeState) {
      for (const ln of buildPositionLines(dadState, claudeState)) {
        const lineColor = ln.kind === 'sl' ? down : ln.kind === 'tp' ? up : ln.engine === 'claude' ? cssVar('--brand', '#c48a1a') : ink2
        candleSeries.createPriceLine({
          price: ln.price,
          color: lineColor,
          lineWidth: 1,
          lineStyle: ln.kind === 'entry' ? 0 : 2, // 0 = solid, 2 = dashed
          axisLabelVisible: true,
          title: `${ln.engine === 'claude' ? 'Claude' : 'Dad'} ${ln.kind.toUpperCase()}`,
        })
      }
    }
```

Map a `TradeMarker` to a lightweight-charts marker with theme colors. Add this helper INSIDE the effect (so it closes over `candles`), before `applyThemeColors`:
```ts
    const candleSecs = new Set(candles.map((c) => Math.floor(c.time / 1000)))
    const tradeMarkerData = (up_: string, down_: string) => {
      if (!(live && tf === 'M5' && dadState && claudeState)) return [] as ReturnType<typeof toSwingLike>
      return buildTradeMarkers(dadState, claudeState, candleSecs).map((m: TradeMarker) => ({
        time: asUtc(m.time),
        position: (m.direction === 'long' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
        shape: (m.direction === 'long' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        color: m.result === 'win' ? up_ : down_,
        text: m.engine === 'claude' ? `C:${m.grade ?? '?'}` : 'D',
      }))
    }
```
> `toSwingLike` above is illustrative only — do NOT reference an undefined symbol. Type the return inline instead: annotate the map result array as `Array<{ time: UTCTimestamp; position: 'belowBar' | 'aboveBar'; shape: 'arrowUp' | 'arrowDown'; color: string; text: string }>`, or omit the helper's explicit return type and let it infer. The point is: build the array of marker objects with the same field shape the swing markers use, using the passed-in `up_`/`down_` theme colors for win/loss.

Now MERGE the trade markers into BOTH `createSeriesMarkers` calls. Replace the initial call:
```ts
    createSeriesMarkers(candleSeries, [
      ...toSwingMarkers(candles, swings, { high: down, low: up }).map((m) => ({ ...m, time: asUtc(m.time) })),
      ...tradeMarkerData(up, down),
    ])
```
And inside `applyThemeColors`, the `createSeriesMarkers` call:
```ts
      createSeriesMarkers(candleSeries, [
        ...toSwingMarkers(candles, swings, { high: themedDown, low: themedUp }).map((m) => ({ ...m, time: asUtc(m.time) })),
        ...tradeMarkerData(themedUp, themedDown),
      ])
```

Finally, extend the effect dependency array to satisfy `react-hooks/exhaustive-deps` (add `dadState`, `claudeState`, `live`, `tf`):
```ts
  }, [candles, emaPeriod, stoch.k, stoch.d, stoch.smooth, dadState, claudeState, live, tf])
```

> If eslint still flags a missing dep (e.g. a helper), add it — do NOT add an eslint-disable. The chart already rebuilds on live data changes, so the extra deps don't introduce new churn.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/PriceChart.test.tsx && npm run lint`
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/PriceChart.tsx src/ui/PriceChart.test.tsx
git commit -m "feat(ui): draw per-engine trade markers + open-position lines on the chart"
```

---

### Task 3: Wire the Chart tab + legend

**Files:**
- Modify: `src/App.tsx` (pass `dadState`/`claudeState`/`live` to `PriceChart`; add a legend under it).
- Test: `src/App.test.tsx` (assert the legend renders on the Chart tab).

**Interfaces:**
- Consumes: `sim.state`, `sim.claudeState`, `mode` (already in scope in `App`).

- [ ] **Step 1: Write the failing test**

Add to `src/App.test.tsx`:
```ts
it('shows the engine marker legend on the Chart tab', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('tab', { name: /chart/i }))
  expect(screen.getByText(/win/i)).toBeInTheDocument()
  expect(screen.getByText(/loss/i)).toBeInTheDocument()
})
```
> Follow the existing `App.test.tsx` tab-activation + mode conventions (match how other tab tests render). If the Chart tab renders regardless of mode, no extra setup is needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — legend text not present.

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`, replace the `tab === 'chart'` body:
```tsx
{tab === 'chart' && (
  <div>
    <PriceChart
      ctx={ctxForRender}
      emaPeriod={activeConfig.ema.period}
      stoch={activeConfig.stoch}
      dadState={sim.state}
      claudeState={sim.claudeState}
      live={mode === 'live'}
    />
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-ink-3">
      <span className="font-semibold uppercase tracking-[0.06em]">Trade markers</span>
      <span><b className="text-ink-2">D</b> = Dad · <b className="text-ink-2">C:grade</b> = Claude</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pass-fg" /> win</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-fail-fg" /> loss</span>
      {mode !== 'live' && <span className="text-ink-3">(markers show in Live mode)</span>}
    </div>
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS. Then the full gate: `npm run typecheck && npx vitest run && npm run lint && npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(ui): Chart tab passes engine states + legend for trade markers"
```

---

## Self-Review

**Spec coverage:**
- History trade markers (win/loss color, engine+grade label) → Tasks 1, 2. ✓
- Live open-position entry/SL/TP lines → Tasks 1, 2. ✓
- Live-only + M5-only marker gating → Task 2. ✓
- Pure, color-free reducer → Task 1. ✓
- Legend → Task 3. ✓
- Optional props / non-breaking → Task 2 (defaults; existing tests keep passing). ✓

**Placeholder scan:** The Task 2 `toSwingLike`/return-type note is an explicit instruction NOT to reference an undefined symbol — it tells the implementer to type the marker array inline. No TBD/TODO.

**Type consistency:** `TradeMarker`/`PositionLine`/`EngineKey` defined in Task 1, consumed in Task 2. `buildTradeMarkers(dad, claude, candleSecs: Set<number>)` and `buildPositionLines(dad, claude)` signatures match between Task 1 and Task 2. `toSec` exported (Task 1) though Task 2 uses an inline `Math.floor(c.time/1000)` for `candleSecs` — both equal `toSec`; acceptable (or import `toSec`). `PriceChart` optional props (Task 2) supplied by `App` (Task 3).

## Notes for the executor
- lightweight-charts `lineStyle`: `0` = Solid, `2` = Dashed (numeric enum values) — avoids a new import + mock entry.
- The existing PriceChart tests pass NO overlay props; they must stay green (props are optional).
- Final gate: `npm run typecheck && npm run test:run && npm run lint && npm run build`, 0 lint warnings.
