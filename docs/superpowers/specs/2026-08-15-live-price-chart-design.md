# Northmark — Live Price Chart with Engine Overlays (design)

**Date:** 2026-08-15 · **Status:** approved (brainstorm) → planning
**Motivation:** The read-only dashboard shows a verdict (WAIT/…) and vetoes but no
visible price action. Without seeing the market move — and without seeing the signals
the verdict is derived from — the screen reads as a "magic 8-ball," which costs the
tool credibility with the trader. This feature makes the underlying live data and the
engine's reasoning **visible**, so the verdict is legible instead of opaque.

## Goal

Add a live **candlestick price chart** for XAU/USD that overlays the engine's own
signals, so the trader can *see why* the verdict says what it says.

Non-goals: order placement or any interactivity beyond a timeframe toggle (read-only
is a hard product rule); replacing the checklist/verdict as the primary decision
surface; a full charting/drawing suite.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| What to show | A price **chart** (not just a number/sparkline) |
| Chart type | **Candlesticks** (green up / red down, market-standard) |
| Overlays | **All three:** EMA9 line, swing high/low markers, stochastic sub-panel |
| Timeframe | **M5 / M15 / H1 toggle** (the three the engine reasons over) |
| Build approach | **lightweight-charts** (TradingView), v5 — accepted new runtime dep |

## Layout

A new full-width `PriceChart` panel sits **below the Phase banner and above the
Trade Card / Vetoes row** — the market-context band that precedes the decision content.

```
Verdict (WAIT · 0/10)              Updated 21:35 UTC   [READ-ONLY]
Phase 1 of 2 banner
────────────────────────────────────────────────────────────────
PRICE   XAU/USD          [M5]  M15   H1     ← timeframe toggle
  ┌──────────────────────────────────────┐
  │ candlesticks + EMA9 line             │  ← main pane
  │ ▵ swing-high / ▿ swing-low markers   │
  ├──────────────────────────────────────┤
  │ stochastic %K/%D, 80/20 bands        │  ← lower pane
  └──────────────────────────────────────┘
────────────────────────────────────────────────────────────────
TRADE CARD              │  NO-TRADE VETOES
```

The chart is **market context, not a control**: nothing on it implies order placement.
The only interactive element is the M5/M15/H1 toggle.

## Data flow — everything comes from the existing pure engine

The credibility principle: every mark on the chart is produced by the **same pure
functions that produce the verdict**, not a separate charting computation.

- **Candles** ← `ctx.m5 / ctx.m15 / ctx.h1` (already fetched by `useMarketData`)
- **EMA9 line** ← `src/indicators/ema.ts`
- **Swing markers** ← `src/indicators/swingPoints.ts`
- **Stochastic pane** ← `src/indicators/stochastic.ts` (%K / %D)

**No new API calls.** The chart renders data the hook already pulls each poll, so it
does **not** increase Twelve Data usage or worsen the free-tier per-minute 429 limit
observed during testing. It visualizes numbers the engine already computes.

## Architecture

Preserve the codebase's discipline: pure engine, single I/O boundary, isolated
impure islands, everything testable.

- **`src/ui/PriceChart.tsx`** — new component. Takes **plain data props** (candles +
  precomputed indicator series + timeframe + theme). Does the imperative
  lightweight-charts work inside a `useRef`/`useEffect` island with correct teardown
  (`chart.remove()` on unmount / before re-create), mirroring how `useMarketData`
  isolates the only other impure surface. The engine stays pure; the chart is just
  another consumer of engine output.
- **`src/ui/chartData.ts`** — small **pure** adapter mapping `Candle[]` + indicator
  outputs → lightweight-charts data shapes (`{ time, open, high, low, close }`,
  line points, marker list). Pure and unit-tested like the rest of the engine.
- **Timeframe state** lives in the parent (or `PriceChart`) as simple UI state; the
  candle/indicator inputs for the selected timeframe are passed as props. No new
  fetching — all three timeframes are already in `ctx`.

### lightweight-charts v5 API (verified against current docs)

- Candles: `chart.addSeries(CandlestickSeries, { upColor, downColor, wickUpColor,
  wickDownColor, borderVisible:false })`.
- EMA9: `chart.addSeries(LineSeries, {...})` in the main pane.
- Stochastic sub-panel: `chart.addSeries(LineSeries, {...}, 1)` — pane index `1`
  creates a lower pane; two line series (%K, %D) plus static 80/20 band lines.
- Swing markers: `createSeriesMarkers(candleSeries, markers)` with
  `position: 'aboveBar' | 'belowBar'`, shapes for high/low.
- Theming: `applyOptions({ layout, grid, ... })` driven by the current theme so the
  chart flips with the existing light/dark toggle.

## Theming & safety

- Colors wired to the existing design tokens via `applyOptions`; the chart flips with
  the theme toggle.
- Candle up/down reuse the design's **colorblind-safe** hues (blue-family up / red
  down per the palette's luminance separation). Direction is *also* readable from
  candle position/shape, so the chart respects the project's "status is never
  color-alone" safety rule. The chart is informational context and is kept visually
  distinct from the verdict/veto **status** system, which is unchanged.

## States

Reuse existing patterns:

- **Loading** (first fetch) → same skeleton/quiet state as the rest of the screen.
- **Data unavailable / error** → the existing calm "Market data unavailable" card;
  the chart panel shows the same empty state rather than a broken canvas.
- **Empty `ctx`** → "Awaiting data," no partial/blank chart.
- A failed *refresh* keeps the last good candles on screen (matches `useMarketData`'s
  "don't blank the screen" contract).

## Testing

- **`chartData.ts`** — pure unit tests (Vitest): candle mapping, ascending-time
  ordering, EMA/stochastic/marker shape conversion, empty-input handling.
- **`PriceChart.tsx`** — behavioral tests (Testing Library): renders with data,
  timeframe toggle switches the series inputs, unmount tears the chart down (no leak),
  empty/error props render the calm state (canvas rendering itself is smoke-tested,
  not pixel-asserted).
- Existing engine tests unchanged (indicators are reused, not modified).

## Dependency

- Add `lightweight-charts@^5` to `package.json` dependencies — the one accepted new
  runtime dependency. No other new deps.

## Out of scope / future

- Crosshair readout, zoom persistence, drawing tools.
- Plotting Phase-2 identified S/R levels and the trade card's entry/SL/TP on the chart
  — natural follow-up once Phase 2 lands, but not part of this change.
