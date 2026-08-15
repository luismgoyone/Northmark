# Live Price Chart with Engine Overlays — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live candlestick chart for XAU/USD that overlays the engine's own EMA9, swing points, and stochastic, so the trader can see *why* the verdict reads WAIT.

**Architecture:** Reuse the existing pure indicators — extended to per-bar *series* — feed them through a pure adapter into a `lightweight-charts` v5 chart isolated inside one `useEffect` island. No new fetching; the chart renders `ctx` the hook already holds. The engine stays pure; only the chart component touches the imperative charting API.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind, Vitest + Testing Library, `lightweight-charts@^5`.

## Global Constraints

- **Read-only product rule:** nothing may imply order placement. The chart's only interactive control is the M5/M15/H1 timeframe toggle. Verbatim from spec: "The chart is market context, not a control."
- **Purity discipline:** indicators and the chart-data adapter are pure and unit-tested; all impure/imperative work lives inside the `PriceChart` `useEffect` island (mirrors `useMarketData`).
- **No new API calls.** The chart reads `ctx.m5 / ctx.m15 / ctx.h1` only. It must not call `fetchCandles` or add Twelve Data usage.
- **Colorblind-safe + never color-alone:** candle up/down reuse the palette's blue-family-up / red-down hues; direction is also readable from candle position. The verdict/veto status system is unchanged.
- **One new dependency only:** `lightweight-charts@^5`. No others.
- **Config values (from `src/config.ts`):** EMA period `9`; stochastic `{ k:14, d:3, smooth:3, overbought:80, oversold:20 }`. Pass these in as props from `defaultConfig`; do not hardcode in the chart.
- **Time units:** `Candle.time` is epoch **milliseconds**; `lightweight-charts` intraday time is a **UTC timestamp in seconds**. The adapter converts ms → s.

---

### Task 1: Add the `lightweight-charts` dependency

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Install the library**

Run: `npm install lightweight-charts@^5`
Expected: `package.json` gains `"lightweight-charts": "^5.x.x"` under `dependencies`; `package-lock.json` updated; exit 0.

- [ ] **Step 2: Verify it resolves and typechecks**

Run: `npm run typecheck`
Expected: PASS (no errors). This confirms the types are installed.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add lightweight-charts dependency for price chart"
```

---

### Task 2: `emaSeries` — per-bar EMA9 as a pure series

**Files:**
- Modify: `src/indicators/ema.ts`
- Test: `src/indicators/ema.test.ts`

**Interfaces:**
- Consumes: `Candle` from `../types`.
- Produces: `emaSeries(candles: Candle[], period: number): (number | null)[]` — length equals `candles.length`; entries before index `period - 1` are `null` (warmup); from `period - 1` onward, the EMA value at that bar. Same SMA-seed + standard smoothing as the existing `ema()`.

- [ ] **Step 1: Write the failing test**

Append to `src/indicators/ema.test.ts`:

```ts
import { emaSeries } from './ema'

describe('emaSeries', () => {
  const mk = (closes: number[]): Candle[] =>
    closes.map((close, i) => ({ time: i * 1000, open: close, high: close, low: close, close }))

  it('returns one entry per candle, null during the warmup period', () => {
    const out = emaSeries(mk([1, 2, 3, 4, 5]), 3)
    expect(out).toHaveLength(5)
    expect(out[0]).toBeNull()
    expect(out[1]).toBeNull()
    expect(out[2]).toBe(2) // SMA seed of first 3 closes (1+2+3)/3
    expect(out[3]).toBeCloseTo(3, 10) // 4*0.5 + 2*0.5
    expect(out[4]).toBeCloseTo(4, 10) // 5*0.5 + 3*0.5
  })

  it('is all-null when there are fewer candles than the period', () => {
    expect(emaSeries(mk([1, 2]), 3)).toEqual([null, null])
  })

  it('agrees with the scalar ema() at the final bar', () => {
    const candles = mk([10, 11, 9, 12, 13, 12, 14])
    const series = emaSeries(candles, 3)
    expect(series[series.length - 1]).toBeCloseTo(ema(candles, 3).value, 10)
  })

  it('throws when period < 1', () => {
    expect(() => emaSeries(mk([1, 2, 3]), 0)).toThrow(/period must be >= 1/)
  })
})
```

(Ensure `ema` and `Candle` are imported at the top of the test file — `ema` likely already is; add `Candle` from `../types` if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/indicators/ema.test.ts -t emaSeries`
Expected: FAIL — `emaSeries is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/indicators/ema.ts`:

```ts
/**
 * Per-bar EMA as a series aligned 1:1 with `candles`.
 *
 * Same SMA-seed + smoothing as `ema()`, but emits the EMA at every bar so it can be
 * plotted as a line. Warmup bars (index < period-1) are `null` — there is no settled
 * EMA yet, and a chart line simply starts at the first real value.
 */
export function emaSeries(candles: Candle[], period: number): (number | null)[] {
  if (period < 1) {
    throw new Error(`emaSeries: period must be >= 1, got ${period}`)
  }
  const out: (number | null)[] = new Array(candles.length).fill(null)
  if (candles.length < period) return out

  let sum = 0
  for (let i = 0; i < period; i++) sum += candles[i]!.close
  let prev = sum / period
  out[period - 1] = prev

  const k = 2 / (period + 1)
  for (let i = period; i < candles.length; i++) {
    prev = candles[i]!.close * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/indicators/ema.test.ts`
Expected: PASS (all, including existing `ema` tests).

- [ ] **Step 5: Commit**

```bash
git add src/indicators/ema.ts src/indicators/ema.test.ts
git commit -m "feat: add emaSeries for per-bar EMA overlay"
```

---

### Task 3: `stochasticSeries` — per-bar %K/%D as a pure series

**Files:**
- Modify: `src/indicators/stochastic.ts`
- Test: `src/indicators/stochastic.test.ts`

**Interfaces:**
- Consumes: `Candle` from `../types`; the module-internal `slowKAt` and `mean` helpers.
- Produces: `stochasticSeries(candles: Candle[], k: number, d: number, smooth: number): ({ k: number; d: number } | null)[]` — length equals `candles.length`; `null` during warmup (index `< k + smooth + d - 3`); otherwise slow `%K` and the `%D` SMA at that bar. Uses the same `slowKAt` math as the scalar `stochastic()`.

- [ ] **Step 1: Write the failing test**

Append to `src/indicators/stochastic.test.ts`:

```ts
import { stochasticSeries } from './stochastic'

describe('stochasticSeries', () => {
  const mk = (n: number): Candle[] =>
    Array.from({ length: n }, (_, i) => {
      const base = 100 + Math.sin(i / 2) * 5
      return { time: i * 1000, open: base, high: base + 1, low: base - 1, close: base }
    })

  it('returns one entry per candle', () => {
    const out = stochasticSeries(mk(40), 14, 3, 3)
    expect(out).toHaveLength(40)
  })

  it('is null during warmup and settled after', () => {
    const out = stochasticSeries(mk(40), 14, 3, 3)
    const minIndex = 14 + 3 + 3 - 3 // 17
    expect(out[minIndex - 1]).toBeNull()
    expect(out[minIndex]).not.toBeNull()
  })

  it('keeps %K and %D within 0..100', () => {
    const out = stochasticSeries(mk(60), 14, 3, 3)
    for (const p of out) {
      if (p === null) continue
      expect(p.k).toBeGreaterThanOrEqual(0)
      expect(p.k).toBeLessThanOrEqual(100)
      expect(p.d).toBeGreaterThanOrEqual(0)
      expect(p.d).toBeLessThanOrEqual(100)
    }
  })

  it('agrees with the scalar stochastic() at the final bar', () => {
    const candles = mk(60)
    const series = stochasticSeries(candles, 14, 3, 3)
    const last = series[series.length - 1]!
    const scalar = stochastic(candles, 14, 3, 3)
    expect(last.k).toBeCloseTo(scalar.k, 8)
    expect(last.d).toBeCloseTo(scalar.d, 8)
  })
})
```

(Ensure `stochastic` and `Candle` are imported at the top of the test file; add if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/indicators/stochastic.test.ts -t stochasticSeries`
Expected: FAIL — `stochasticSeries is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/indicators/stochastic.ts` (below the existing `stochastic` function, so it can use the module-internal `slowKAt` and `mean`):

```ts
/**
 * Per-bar slow stochastic as a series aligned 1:1 with `candles`.
 *
 * Same `slowKAt` math as `stochastic()`, emitted at every settled bar so %K/%D can be
 * plotted in a sub-panel. Warmup bars (index < k + smooth + d - 3) are `null`: below
 * that there isn't enough history for a trustworthy read, matching the scalar
 * function's bias toward a neutral WAIT rather than a false signal.
 */
export function stochasticSeries(
  candles: Candle[],
  k: number,
  d: number,
  smooth: number,
): ({ k: number; d: number } | null)[] {
  const n = candles.length
  const out: ({ k: number; d: number } | null)[] = new Array(n).fill(null)
  const minIndex = k + smooth + d - 3
  for (let i = 0; i < n; i++) {
    if (i < minIndex) continue
    const slowK = slowKAt(candles, i, k, smooth)
    const dValues: number[] = []
    for (let j = i - d + 1; j <= i; j++) dValues.push(slowKAt(candles, j, k, smooth))
    out[i] = { k: slowK, d: mean(dValues) }
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/indicators/stochastic.test.ts`
Expected: PASS (all, including existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/indicators/stochastic.ts src/indicators/stochastic.test.ts
git commit -m "feat: add stochasticSeries for sub-panel overlay"
```

---

### Task 4: `chartData.ts` — pure adapter to lightweight-charts shapes

**Files:**
- Create: `src/ui/chartData.ts`
- Test: `src/ui/chartData.test.ts`

**Interfaces:**
- Consumes: `Candle` from `../types`; the series produced by Tasks 2–3; `swingPoints` output `{ highs: number[]; lows: number[] }`.
- Produces:
  - `type ChartTime = number` (UTC seconds)
  - `type CandlePoint = { time: ChartTime; open: number; high: number; low: number; close: number }`
  - `type LinePoint = { time: ChartTime; value: number }`
  - `type SwingMarker = { time: ChartTime; position: 'aboveBar' | 'belowBar'; shape: 'arrowDown' | 'arrowUp'; color: string; text: string }`
  - `toCandlePoints(candles: Candle[]): CandlePoint[]`
  - `toLinePoints(candles: Candle[], series: (number | null)[]): LinePoint[]`
  - `toStochLines(candles: Candle[], series: ({ k: number; d: number } | null)[]): { k: LinePoint[]; d: LinePoint[] }`
  - `toSwingMarkers(candles: Candle[], swings: { highs: number[]; lows: number[] }, colors: { high: string; low: string }): SwingMarker[]` — merged and **sorted ascending by time** (lightweight-charts requires it).

- [ ] **Step 1: Write the failing test**

Create `src/ui/chartData.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Candle } from '../types'
import { toCandlePoints, toLinePoints, toStochLines, toSwingMarkers } from './chartData'

const mk = (closes: number[]): Candle[] =>
  closes.map((c, i) => ({ time: (i + 1) * 60_000, open: c, high: c + 1, low: c - 1, close: c }))

describe('toCandlePoints', () => {
  it('converts ms→s and preserves OHLC', () => {
    const [p] = toCandlePoints(mk([100]))
    expect(p).toEqual({ time: 60, open: 100, high: 101, low: 99, close: 100 })
  })
})

describe('toLinePoints', () => {
  it('drops null warmup entries and aligns time', () => {
    const candles = mk([1, 2, 3])
    const out = toLinePoints(candles, [null, 2, 3])
    expect(out).toEqual([
      { time: 120, value: 2 },
      { time: 180, value: 3 },
    ])
  })
})

describe('toStochLines', () => {
  it('splits into k and d lines, skipping nulls', () => {
    const candles = mk([1, 2])
    const out = toStochLines(candles, [null, { k: 60, d: 55 }])
    expect(out.k).toEqual([{ time: 120, value: 60 }])
    expect(out.d).toEqual([{ time: 120, value: 55 }])
  })
})

describe('toSwingMarkers', () => {
  it('maps highs above / lows below and sorts ascending by time', () => {
    const candles = mk([1, 2, 3, 4])
    const out = toSwingMarkers(
      candles,
      { highs: [2], lows: [1] },
      { high: '#aaa', low: '#bbb' },
    )
    expect(out.map((m) => m.time)).toEqual([120, 180]) // sorted: low@idx1(t=120), high@idx2(t=180)
    expect(out[0]).toMatchObject({ position: 'belowBar', shape: 'arrowUp', color: '#bbb' })
    expect(out[1]).toMatchObject({ position: 'aboveBar', shape: 'arrowDown', color: '#aaa' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/chartData.test.ts`
Expected: FAIL — cannot resolve `./chartData`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/chartData.ts`:

```ts
import type { Candle } from '../types'

/** lightweight-charts intraday time is a UTC timestamp in SECONDS. */
export type ChartTime = number

export type CandlePoint = { time: ChartTime; open: number; high: number; low: number; close: number }
export type LinePoint = { time: ChartTime; value: number }
export type SwingMarker = {
  time: ChartTime
  position: 'aboveBar' | 'belowBar'
  shape: 'arrowDown' | 'arrowUp'
  color: string
  text: string
}

const toSec = (ms: number): ChartTime => Math.floor(ms / 1000)

/** `Candle[]` → candlestick series data (ms→s, OHLC preserved). */
export function toCandlePoints(candles: Candle[]): CandlePoint[] {
  return candles.map((c) => ({
    time: toSec(c.time),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }))
}

/** A nullable per-bar series → line points, dropping warmup nulls. */
export function toLinePoints(candles: Candle[], series: (number | null)[]): LinePoint[] {
  const out: LinePoint[] = []
  for (let i = 0; i < candles.length; i++) {
    const v = series[i]
    if (v == null) continue
    out.push({ time: toSec(candles[i]!.time), value: v })
  }
  return out
}

/** Stochastic series → separate %K and %D line data. */
export function toStochLines(
  candles: Candle[],
  series: ({ k: number; d: number } | null)[],
): { k: LinePoint[]; d: LinePoint[] } {
  const k: LinePoint[] = []
  const d: LinePoint[] = []
  for (let i = 0; i < candles.length; i++) {
    const p = series[i]
    if (p == null) continue
    const time = toSec(candles[i]!.time)
    k.push({ time, value: p.k })
    d.push({ time, value: p.d })
  }
  return { k, d }
}

/** Swing indices → markers, merged and sorted ascending by time. */
export function toSwingMarkers(
  candles: Candle[],
  swings: { highs: number[]; lows: number[] },
  colors: { high: string; low: string },
): SwingMarker[] {
  const markers: SwingMarker[] = []
  for (const i of swings.highs) {
    const c = candles[i]
    if (!c) continue
    markers.push({ time: toSec(c.time), position: 'aboveBar', shape: 'arrowDown', color: colors.high, text: '' })
  }
  for (const i of swings.lows) {
    const c = candles[i]
    if (!c) continue
    markers.push({ time: toSec(c.time), position: 'belowBar', shape: 'arrowUp', color: colors.low, text: '' })
  }
  return markers.sort((a, b) => a.time - b.time)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/chartData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/chartData.ts src/ui/chartData.test.ts
git commit -m "feat: add pure chartData adapter for lightweight-charts"
```

---

### Task 5: `PriceChart.tsx` — the chart component

**Files:**
- Create: `src/ui/PriceChart.tsx`
- Test: `src/ui/PriceChart.test.tsx`

**Interfaces:**
- Consumes: `MarketContext` from `../types`; Task 2–4 outputs; `swingPoints` from `../indicators/swingPoints`; `lightweight-charts` (`createChart`, `CandlestickSeries`, `LineSeries`, `createSeriesMarkers`).
- Produces: `PriceChart({ ctx, emaPeriod, stoch }: { ctx: MarketContext; emaPeriod: number; stoch: { k: number; d: number; smooth: number } }): ReactElement`. Renders a panel with an M5/M15/H1 toggle (default M5) and a chart container; builds the chart imperatively inside a `useEffect` keyed on the selected candles.

**Design notes for the implementer:**
- `lightweight-charts` renders to `<canvas>`, which jsdom does not implement — so the **test mocks the module** (`vi.mock('lightweight-charts', ...)`) and asserts the component wires data correctly and renders the toggle/state. The real drawing is verified manually via `/run` in Task 6.
- Theme colors are read from CSS custom properties on `document.documentElement` (e.g. `--pass-fg`, `--fail-fg`, `--ink-2`, `--border`) via `getComputedStyle`, and re-applied when the `data-theme` attribute changes (a `MutationObserver`). This matches how the app toggles theme (mutating `data-theme` directly), so no App state change is needed.
- The `useEffect` MUST call `chart.remove()` in its cleanup to avoid leaks and duplicate canvases across timeframe switches.

- [ ] **Step 1: Write the failing test**

Create `src/ui/PriceChart.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Candle } from '../types'

const removeMock = vi.fn()
const setDataMock = vi.fn()
const addSeriesMock = vi.fn(() => ({ setData: setDataMock, applyOptions: vi.fn() }))
const createChartMock = vi.fn(() => ({
  addSeries: addSeriesMock,
  applyOptions: vi.fn(),
  timeScale: () => ({ fitContent: vi.fn() }),
  remove: removeMock,
}))

vi.mock('lightweight-charts', () => ({
  createChart: createChartMock,
  CandlestickSeries: 'Candlestick',
  LineSeries: 'Line',
  createSeriesMarkers: vi.fn(),
}))

import { PriceChart } from './PriceChart'

const series = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: (i + 1) * 60_000, open: 100, high: 101, low: 99, close: 100 }))

const ctx = { m5: series(40), m15: series(40), h1: series(40) }
const props = { ctx, emaPeriod: 9, stoch: { k: 14, d: 3, smooth: 3 } }

beforeEach(() => {
  createChartMock.mockClear()
  addSeriesMock.mockClear()
  setDataMock.mockClear()
  removeMock.mockClear()
})

describe('PriceChart', () => {
  it('creates a chart and adds candlestick + overlay series', () => {
    render(<PriceChart {...props} />)
    expect(createChartMock).toHaveBeenCalledTimes(1)
    // candles + EMA9 + stoch %K + stoch %D = 4 series minimum
    expect(addSeriesMock.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(setDataMock).toHaveBeenCalled()
  })

  it('renders the M5/M15/H1 timeframe toggle', () => {
    render(<PriceChart {...props} />)
    expect(screen.getByRole('button', { name: 'M5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'M15' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'H1' })).toBeInTheDocument()
  })

  it('rebuilds the chart when the timeframe changes', () => {
    render(<PriceChart {...props} />)
    createChartMock.mockClear()
    removeMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'H1' }))
    expect(removeMock).toHaveBeenCalled() // old chart torn down
    expect(createChartMock).toHaveBeenCalledTimes(1) // new one built
  })

  it('tears the chart down on unmount', () => {
    const { unmount } = render(<PriceChart {...props} />)
    unmount()
    expect(removeMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/PriceChart.test.tsx`
Expected: FAIL — cannot resolve `./PriceChart`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/PriceChart.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'
import type { MarketContext, Candle } from '../types'
import { emaSeries } from '../indicators/ema'
import { stochasticSeries } from '../indicators/stochastic'
import { swingPoints } from '../indicators/swingPoints'
import { toCandlePoints, toLinePoints, toStochLines, toSwingMarkers } from './chartData'

type Timeframe = 'M5' | 'M15' | 'H1'
const TIMEFRAMES: Timeframe[] = ['M5', 'M15', 'H1']
const CANDLES: Record<Timeframe, keyof MarketContext> = { M5: 'm5', M15: 'm15', H1: 'h1' }

/** Read a CSS custom property off the document root (theme-driven colors). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

type Props = {
  ctx: MarketContext
  emaPeriod: number
  stoch: { k: number; d: number; smooth: number }
}

export function PriceChart({ ctx, emaPeriod, stoch }: Props): ReactElement {
  const [tf, setTf] = useState<Timeframe>('M5')
  const containerRef = useRef<HTMLDivElement>(null)

  const candles: Candle[] = ctx[CANDLES[tf]]

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const up = cssVar('--pass-fg', '#0b7a4a')
    const down = cssVar('--fail-fg', '#c0392b')
    const ink2 = cssVar('--ink-2', '#545f6d')
    const border = cssVar('--border', '#d7dee7')
    const surface = cssVar('--surface', '#ffffff')

    const chart = createChart(el, {
      height: 340,
      layout: { background: { color: surface }, textColor: ink2, attributionLogo: false },
      grid: { vertLines: { color: border }, horzLines: { color: border } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
    })
    candleSeries.setData(toCandlePoints(candles))

    const emaLine = chart.addSeries(LineSeries, { color: cssVar('--brand', '#c48a1a'), lineWidth: 2, priceLineVisible: false })
    emaLine.setData(toLinePoints(candles, emaSeries(candles, emaPeriod)))

    const stochData = toStochLines(candles, stochasticSeries(candles, stoch.k, stoch.d, stoch.smooth))
    const kLine = chart.addSeries(LineSeries, { color: ink2, lineWidth: 2, priceLineVisible: false }, 1)
    kLine.setData(stochData.k)
    const dLine = chart.addSeries(LineSeries, { color: cssVar('--brand', '#c48a1a'), lineWidth: 1, priceLineVisible: false }, 1)
    dLine.setData(stochData.d)

    const markers = toSwingMarkers(candles, swingPoints(candles), { high: down, low: up })
    createSeriesMarkers(candleSeries, markers)

    chart.timeScale().fitContent()

    // Re-theme when the app flips data-theme (App mutates the attribute directly).
    const observer =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            chart.applyOptions({
              layout: { background: { color: cssVar('--surface', '#ffffff') }, textColor: cssVar('--ink-2', '#545f6d') },
              grid: { vertLines: { color: cssVar('--border', '#d7dee7') }, horzLines: { color: cssVar('--border', '#d7dee7') } },
            })
          })
        : null
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      observer?.disconnect()
      chart.remove()
    }
  }, [candles, emaPeriod, stoch.k, stoch.d, stoch.smooth])

  return (
    <section className="mb-4 rounded-panel border border-border bg-surface p-4 shadow-panel">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">Price</span>
        <span className="font-mono text-[12.5px] text-ink-2">XAU/USD</span>
        <div className="ml-auto inline-flex overflow-hidden rounded-chip border border-border">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              aria-pressed={tf === t}
              className={
                'px-3 py-1 text-[12px] font-semibold ' +
                (tf === t ? 'bg-surface-sunken text-ink' : 'bg-surface text-ink-2 hover:text-ink')
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} />
    </section>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/PriceChart.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If lightweight-charts v5 type names differ (e.g. an option name), adjust to the installed types — do not suppress with `any`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/PriceChart.tsx src/ui/PriceChart.test.tsx
git commit -m "feat: add PriceChart with EMA9, swing markers, stochastic panel"
```

---

### Task 6: Wire `PriceChart` into the dashboard

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `PriceChart` from Task 5; existing `ctx` and `config` already present in `App`.
- Produces: no new exports. The chart renders in the loaded state, below the Phase-1 banner `<p>` and above the `TradeCard`/`VetoList` grid.

- [ ] **Step 1: Write the failing test**

Add to `src/App.test.tsx` (the app already mocks `useMarketData` to supply `ctx`; follow the existing pattern in that file). Also add the same `vi.mock('lightweight-charts', ...)` block used in `PriceChart.test.tsx` so the canvas library is stubbed. Add:

```tsx
it('renders the price chart with a timeframe toggle when data is loaded', () => {
  render(<App />)
  expect(screen.getByRole('button', { name: 'M5' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx -t "price chart"`
Expected: FAIL — no `M5` button (chart not yet wired).

- [ ] **Step 3: Add the import and render the component**

In `src/App.tsx`, add to the imports:

```tsx
import { PriceChart } from './ui/PriceChart'
```

Then, in the loaded-state JSX, insert the chart immediately after the Phase-1 banner `<p>...Phase 2...</p>` and before the `<div className="grid ...">` that holds `TradeCard`/`VetoList`:

```tsx
<PriceChart ctx={ctx} emaPeriod={config.ema.period} stoch={config.stoch} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (all).

- [ ] **Step 5: Full suite + typecheck + lint**

Run: `npm run test:run && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 6: Manual verification with the real library**

Ensure `.env.local` has `VITE_TWELVEDATA_KEY`. Run `npm run dev`, open the app, and confirm: candlesticks render for XAU/USD; the EMA9 line overlays; swing arrows appear; the stochastic sub-panel shows below with %K/%D; the M5/M15/H1 toggle switches the chart; the theme toggle re-colors the chart. (If the free-tier 429 appears, wait ~60s — the chart adds no calls, so this is unrelated.)

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: wire live price chart into dashboard"
```

---

## Self-Review

**Spec coverage:**
- Candlestick chart → Task 5 (`CandlestickSeries`). ✓
- EMA9 overlay → Tasks 2, 4, 5. ✓
- Swing markers → Task 4 (`toSwingMarkers`) + Task 5 (`createSeriesMarkers`). ✓
- Stochastic sub-panel → Tasks 3, 4, 5 (pane index 1). ✓
- M5/M15/H1 toggle → Task 5 (state + buttons). ✓
- lightweight-charts v5 → Task 1. ✓
- Layout (below banner, above grid) → Task 6. ✓
- No new API calls → chart consumes `ctx` only; no `fetchCandles` import anywhere in Tasks 4–6. ✓
- Theming / light+dark → Task 5 (`cssVar` + `MutationObserver`). ✓
- Read-only (only toggle is interactive) → Task 5. ✓
- States (loading/error/empty) → the chart renders only in the existing loaded branch of `App`; the untouched `!ctx` branch keeps the calm loading/unavailable cards. ✓
- Testing (pure adapter + component + app) → Tasks 2–6. ✓
- Purity discipline → indicators/adapter pure; imperative work confined to the `useEffect`. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `emaSeries → (number|null)[]` consumed by `toLinePoints`; `stochasticSeries → ({k,d}|null)[]` consumed by `toStochLines`; `swingPoints → {highs,lows}` consumed by `toSwingMarkers`; `PriceChart` props `{ ctx, emaPeriod, stoch:{k,d,smooth} }` supplied by `App` from `config.ema.period` and `config.stoch`. Consistent across tasks.

## Note on lightweight-charts v5 API

The v5 series API is `chart.addSeries(SeriesDefinition, options, paneIndex?)` with definitions imported as `CandlestickSeries` / `LineSeries`, and markers via the standalone `createSeriesMarkers(series, markers)`. If the installed patch version differs on an option name, adjust to the installed types rather than casting to `any`.
