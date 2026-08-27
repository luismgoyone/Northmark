# Per-Engine Chart Markers — Design Spec

**Date:** 2026-08-28
**Status:** Approved for planning
**Context:** Deferred item from the dual-engine bake-off (Phases 1–3, merged). Adds the two engines' paper-trading activity onto the Chart tab.

## Purpose

Show, on the price chart, what each engine ("Dad + ChatGPT" and "Claude") actually did:
- **History markers** — an entry arrow per past trade, colored by result (win/loss), labeled by engine + grade.
- **Live level lines** — horizontal entry / SL / TP lines for each engine's currently-open position.

So the bake-off is visible on the chart, not only in the Paper tab.

## Constraints (what makes this correct)

- **Markers only on M5 + Live.** Trades open on M5 candle times; markers must align to a loaded candle or lightweight-charts mishandles them. In Demo mode the chart's demo candles don't share the sim timeline, so overlays are hidden entirely.
- **Position lines** are price levels → valid on any timeframe, but still only in Live mode (they describe a live open position).
- **Additive & non-breaking.** The new `PriceChart` props are optional; with them absent, the chart behaves exactly as today.
- **Purity.** The reduction from `SimState` → marker/line descriptors is a pure, unit-tested helper carrying *semantic* fields (engine, direction, result, grade, kind) — NOT colors. `PriceChart` maps semantics → theme colors, so theme-flip re-coloring keeps working.
- Engine internals, sim, api untouched. NodeNext `.js` imports.

## Design

### Pure helper — `src/ui/chartOverlays.ts`
```
type EngineKey = 'dad' | 'claude'
type TradeMarker  = { time: number; engine: EngineKey; direction: Direction; result: 'win' | 'loss'; grade?: Grade }
type PositionLine = { engine: EngineKey; direction: Direction; kind: 'entry' | 'sl' | 'tp'; price: number; grade?: Grade }

buildTradeMarkers(dad: SimState, claude: SimState, candleSecs: Set<number>): TradeMarker[]
  // one marker per closed trade whose toSec(openedAtTime) ∈ candleSecs, both engines
buildPositionLines(dad: SimState, claude: SimState): PositionLine[]
  // entry/sl/tp lines for each engine's open position (if any)
```
Reuses `toSec` from `chartData.ts` (exported for this) so marker times match the candle series exactly.

### `PriceChart` changes
- New optional props: `dadState?: SimState`, `claudeState?: SimState`, `live?: boolean`.
- When `live` and both states present:
  - **Position lines** (any tf): `candleSeries.createPriceLine({ price, color, lineStyle, title })` per `PositionLine` — entry solid in the engine's accent, SL dashed red, TP dashed green, title like `Claude TP`.
  - **Trade markers** (tf === 'M5' only): build `candleSecs` from the loaded candles, call `buildTradeMarkers`, map each to a lightweight-charts marker — position/shape by direction (long → belowBar/arrowUp, short → aboveBar/arrowDown), **color by result** (green win / red loss), **text** by engine + grade (`D` for Dad, `C:A` for Claude grade A). Merge with the existing swing markers in the single `createSeriesMarkers` call.
- Re-color on theme flip via the existing `applyThemeColors` path; overlays rebuild with the effect's deps (the new states + `live`).

### `App` wiring
- Chart tab passes `dadState={sim.state}`, `claudeState={sim.claudeState}`, `live={mode === 'live'}`.
- A small **legend** under the chart header: Dad vs Claude marker text, win = green / loss = red.

## Testing
- `chartOverlays.test.ts` — unit-test both reducers: marker filtering by `candleSecs`, direction/result/grade mapping, both engines, open-position line extraction, empty states → `[]`.
- `PriceChart.test.tsx` — extend the lightweight-charts mock with `createPriceLine`; assert it renders (no crash) with overlay props and that price lines are created for an open position.
- Full gate: `typecheck && test:run && lint && build`.

## Out of scope
Exit markers (entry-only keeps it readable), P&L labels on the chart (the Paper tab has those), non-M5 marker alignment.
