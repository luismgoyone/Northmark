# Demo Data Toggle — Design

> Status: approved by Luis 2026-08-18. A local-only demo mode for the Northmark dashboard
> that feeds the deterministic engine canned `MarketContext` fixtures so the full pipeline
> (checklist → score → trade card) can be exercised on demand, instead of waiting for a rare
> live setup. No AI, no new external integration — demo mode uses built-in data.

## Goal

Let the user see every stage of the decision pipeline — a fully authorized setup, a
partially-built setup, and a WAIT — without waiting for live gold to form one. Do it without
touching a single line of engine code, and mark demo mode so unmistakably that a demo setup can
never be confused for a real live signal.

## Non-goals

- No changes to `src/gates/*`, `src/scoring/*`, or `src/indicators/*` (the engine is frozen).
- No historical replay / backtest timeline (that is a separate, larger feature).
- No real-time (per-second) tick feed.

## Architecture

The engine is already a pure function of its input: `evaluateSetup(ctx: MarketContext, config)`.
Demo mode changes only *which ctx* the app feeds it. App gains a `mode` selector; the rest of
the render tree is unchanged.

```
mode: 'live' | 'demo-setup' | 'demo-building' | 'demo-wait'
   ├─ 'live'  → ctx from useMarketData()  (today's behavior; polling active)
   └─ demo-*  → ctx from DEMO_PRESETS[mode]  (polling paused; no fetch)
        → evaluateSetup(ctx, config) → Score / Checklist / TradeCard / VetoList  (unchanged)
```

### Components

- **`src/demo/presets.ts`** (new, pure, no I/O). Exports `DemoPreset = { id; label; ctx: MarketContext }`
  and `DEMO_PRESETS: DemoPreset[]` — three presets:
  1. **`demo-setup`** "Authorized LONG setup" → `evaluateSetup(...).status === 'setup'`, direction `long`,
     Trade Card populated (entry/sl/tp1/tp2/lot/RR).
  2. **`demo-building`** "Building — blocked at retest" → `status:'wait'`, `blockedBy:'retest'`
     (bias/structure/consolidation/level/breakout all `pass`, retest not yet).
  3. **`demo-wait`** "WAIT — H1 bias unclear" → `status:'wait'`, `blockedBy:'h1-m15-bias'`.
  Each `ctx` is built by candle builders defined in `src/demo/` (NOT imported from `tests/`; src
  must not depend on tests). The M5 narrative for `demo-setup` mirrors the proven full-narrative
  fixture; `h1`/`m15` carry a clean long structure so bias + M15 structure pass.

- **`src/ui/DemoSwitch.tsx`** (new). A header control rendered next to the theme toggle:
  a `<select>` (or segmented control) labeled **"Data"** with options **Live** (default),
  and the three demo presets by `label`. Emits the chosen `mode`. When a demo option is active,
  the control renders in the amber/"build" token color with a "DEMO" affordance, not the neutral
  live style.

- **`src/ui/DemoBanner.tsx`** (new, or a small inline block). A full-width amber banner rendered
  directly under the header **only when `mode !== 'live'`**:
  **"DEMO DATA — illustrative only, not a live signal. Switch to Live for real market data."**
  Uses the existing `build`/warning design tokens (amber), with an icon, high-contrast, and an
  inline "Switch to Live" action that sets `mode='live'`.

- **`src/App.tsx`** (modified). Holds `const [mode, setMode] = useState<Mode>('live')`. Selects
  `ctx`: when `mode==='live'`, the current `useMarketData()` path (loading/error states unchanged);
  when a demo preset, `ctx = DEMO_PRESETS.find(...).ctx` (no loading/error — data is instant, so
  render the dashboard immediately). Renders `<DemoSwitch mode value onChange>` in the header and
  `<DemoBanner>` when in demo mode. Everything below (Score/Checklist/TradeCard/VetoList/PriceChart)
  consumes the resulting `verdict` exactly as today.

### Polling pause

`useMarketData` is always mounted, but in demo mode its `ctx` is simply ignored, and to avoid
burning API credits while demoing, the hook must stop polling when not live. Cleanest: pass an
`enabled: boolean` arg — `useMarketData(mode === 'live')`. When `enabled` is false the effect does
not fetch or schedule timers (and cancels any running ones); flipping back to true resumes the
existing aligned-poll behavior. This is the single change to an existing file outside App/UI, and
it is additive (default `enabled = true` preserves current callers/tests).

## Honesty invariants (hard requirements)

- **Live is the default** on every load (`mode` initial = `'live'`).
- Whenever `mode !== 'live'`: the DEMO banner is visible AND the DemoSwitch shows the amber DEMO
  state. Both, always — never one without the other.
- The banner copy must say the data is **not a live signal**.
- Read-only invariant unchanged: **no BUY button**, no order affordance, in any mode.

## Data flow / error handling

- Demo presets are synchronous and always present → no loading or error states in demo mode.
- If a preset id is somehow unknown, fall back to `'live'` (never render a blank/broken screen).
- Live mode error/loading behavior is untouched.

## Testing

- **`src/demo/presets.test.ts`** — the anti-drift guard: for each preset, assert
  `evaluateSetup(preset.ctx, defaultConfig)` produces the intended `status` (and `blockedBy` /
  `direction` where relevant). This pins presets to *real* engine behavior; if a gate changes and a
  preset no longer reaches its state, this test fails loudly rather than the demo silently lying.
- **`src/ui/DemoSwitch.test.tsx`** — renders Live + 3 options; selecting one calls `onChange` with
  the right mode; the amber DEMO state appears for demo options, neutral for Live.
- **`src/App.test.tsx`** (extend) — default load is Live (no banner); switching to a demo preset
  shows the DEMO banner and populates the dashboard from the preset; still no BUY button; switching
  back to Live hides the banner.
- **`useMarketData.test.ts`** (extend) — `enabled=false` does not fetch or schedule timers; toggling
  to `true` starts them; default (`enabled` omitted) preserves current behavior.

## File structure

```
src/
├─ demo/
│  ├─ presets.ts          # NEW — DEMO_PRESETS (+ candle builders), pure
│  └─ presets.test.ts     # NEW — pins each preset to evaluateSetup behavior
├─ ui/
│  ├─ DemoSwitch.tsx      # NEW — header control
│  ├─ DemoSwitch.test.tsx # NEW
│  └─ DemoBanner.tsx      # NEW — amber "not a live signal" banner
├─ hooks/useMarketData.ts # MODIFY — add `enabled` arg (additive; default true)
└─ App.tsx                # MODIFY — mode state, ctx selection, render switch + banner
```

## Self-review

- **Placeholders:** none. Each preset's target verdict is concrete; the presets test pins them.
- **Consistency:** engine untouched; the only existing-file changes are `App.tsx` (wiring) and
  `useMarketData.ts` (additive `enabled`). Honesty invariants stated once and testable.
- **Scope:** one spec, ~2 build tasks (presets+test, then UI+App+hook+tests). Focused.
- **Ambiguity:** "Building — blocked at retest" is defined precisely (bias/structure/consolidation/
  level/breakout pass, retest not reached → `blockedBy:'retest'`), so the fixture has a testable target.
