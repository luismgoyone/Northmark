# Paper Trading — Live Forward-Test (Phase A.1) Design

**Date:** 2026-08-21
**Status:** Design — approved for planning
**Context memory:** Northmark is a father-son project; the larger goal is a multi-user paper-trading
sim (credits, not real money) to validate the XAUUSD strategy before risking capital.

## Motivation

The engine already *decides* setups (`evaluateSetup` → `SetupVerdict`). The next chapter is to
**act on those verdicts in a simulation** so the strategy can be validated safely. This spec covers
the first shippable slice: a **client-only live forward-test** that paper-trades authorized setups
with credits while the app is open, tracking a running balance and win-rate.

It is deliberately the smallest useful piece of a bigger staged vision:

- **Phase A.1 (this spec):** client-only live forward-test, saved to the device.
- **Phase A.2 (next):** a 24/7 server job (Vercel Cron + a store) that runs the *same* sim core
  around the clock, so coverage isn't limited to when the app is open.
- **Phase B:** trade journal + analytics (win-rate by pattern / by veto).
- **Phase C:** accounts + backend (login, persistent credits, multi-user).
- **Phase D:** manual "trade it yourself" mode (Vantage-like) on the same engine.

The sim core in A.1 is written as a **pure, deterministic reducer** specifically so A.2's cron reuses
it unchanged.

## Decisions locked (from brainstorming)

- **Mode:** automated forward-test (not backtest) — accumulate on live data going forward.
- **Where it runs:** client-only first (localStorage), server job next.
- **Exit rule:** full position closes at **TP2 (2R)** or **SL** — faithful to the strategy's 2:1
  target and min R:R. If a single candle touches both, count the **stop** (conservative; never
  inflates the win-rate).
- **Concurrency:** one open position at a time.
- **Re-open:** after a trade closes, the same setup will not reopen until the engine returns to WAIT
  and authorizes fresh.
- **Honesty:** everything labeled PAPER / credits, not real money. Only Live-mode trades are recorded
  (demo never pollutes the record). Win-rate is always shown *with* average R.

## Architecture

New pure `src/sim/` module (imports only `../types`), a driving hook in `src/hooks/`, and a UI panel
in `src/ui/`. Preserves the one-way import direction: `ui → hooks → sim → scoring → gates →
indicators → types`. Nothing imports `sim` except the hook and UI; `sim` never imports `scoring`
(the hook adapts a `SetupVerdict` into a narrow `SetupSignal`), so the sim stays decoupled and
trivially testable.

### `src/sim/types.ts`

```ts
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

### `src/sim/engine.ts` — pure reducer

Narrow input so `sim` never depends on `scoring`:

```ts
export type SetupSignal =
  | { authorized: true; direction: Direction; entry: number; sl: number; tp: number }
  | { authorized: false }
```

Functions:

- `initialSimState(config: SimConfig): SimState` — `{ startingBalance, balance: startingBalance,
  open: null, armed: true, trades: [], nextId: 1 }`.
- `simStep(state, signal: SetupSignal, config: SimConfig, latest: Candle): SimState` — the one entry
  point. It **settles** the open position against `latest`, then **maybe-opens** a new one:
  1. **Settle:** if a position is open, test the latest candle. Long: SL if `low <= sl`, TP if
     `high >= tp`. Short: SL if `high >= sl`, TP if `low <= tp`. If neither, no change. If **both**
     touched in one candle → exit at the **stop** (`result: 'loss'`, `rMultiple: -1`). Otherwise exit
     at whichever was hit (`tp` → win `+rr`, `sl` → loss `-1`). Append a `SimTrade`, add
     `pnlCredits` to `balance`, set `open: null`, `armed: false`.
  2. **Maybe-open:** if `signal.authorized === false` → re-arm (`armed: true`) and return. If a
     position is open OR `!armed` → no change. Else open: `riskCredits = balance * riskPct`,
     `rr = |tp − entry| / |entry − sl|`, id `` `t${nextId}` ``, `armed: false`, `nextId + 1`.

  Rationale for `armed`: opening sets `armed=false`; a close sets `armed=false`; only a WAIT
  (`authorized:false`) re-arms. This guarantees at most one trade per setup and forces a WAIT between
  trades, so a persistent authorization can't machine-gun identical entries.

### `src/sim/stats.ts` — pure derivation

```ts
export type SimStats = {
  trades: number; wins: number; losses: number
  winRate: number      // wins / trades, 0 when no trades
  avgR: number         // mean rMultiple, 0 when no trades
  pnlCredits: number   // balance − startingBalance
  returnPct: number    // pnlCredits / startingBalance * 100
}
export function simStats(state: SimState): SimStats
```

### `src/sim/config.ts`

`export const SIM_STARTING_BALANCE = 10_000`. The hook builds `SimConfig` as
`{ startingBalance: SIM_STARTING_BALANCE, riskPct: config.riskPct }` so risk mirrors the main config.

### `src/hooks/useSim.ts`

Drives the reducer from live data. Impure boundary (localStorage) lives here, not in `sim`.

- Signature: `useSim(ctx: MarketContext | null, verdict: SetupVerdict, enabled: boolean, config:
  Config): { state: SimState; stats: SimStats; reset: () => void }`.
- Initializes `SimState` from `localStorage['northmark-sim-v1']` (validated; falls back to
  `initialSimState` on missing/parse error), inside a lazy `useState` initializer.
- Builds `SetupSignal` from `verdict`: `status === 'setup'` →
  `{ authorized: true, direction, entry, sl, tp: tp2 }`; else `{ authorized: false }`.
- Steps **only when `enabled`** (Live mode) **and** the latest M5 candle time has advanced past the
  last processed time (a `useRef` guard) — so re-renders don't re-run the same candle, and demo mode
  never records.
- Persists state to localStorage after each step (try/catch).
- `reset()` clears to `initialSimState` and overwrites storage.

### `src/ui/SimPanel.tsx`

Prop-driven, pure. Renders:

- Header "Paper Trading" + a "PAPER · credits, not real money" honesty chip.
- Stat row: **Balance** (credits), **Win rate** (`wins/total`), **Record** (W–L), **Avg R**,
  **Return %** — win-rate and Avg R sit together so the number is read honestly.
- **Open position** (if any): direction, entry, SL, TP.
- **Recent trades** (last ~8): result (win/loss via the shared StatusIcon tones), R multiple, credits.
- **Reset** button (the only control; no buy/order/execute affordance — read-only ethos holds).
- Empty state when `trades.length === 0`: "No paper trades yet. When a setup authorizes in Live mode,
  Northmark opens one automatically."

### App wiring (`src/App.tsx`)

- `const { state: simState, stats: simStatsValue, reset: resetSim } = useSim(activeCtx, result, mode
  === 'live', activeConfig)`.
- Render `<SimPanel state={simState} stats={simStatsValue} onReset={resetSim} />` **only in Live
  mode** (in demo it's hidden, so the live record is never shown against demo candles). Placement:
  full-width panel directly under the `TradeCard` / `VetoList` grid, above the `Checklist`.

## Edge cases

- **Both TP and SL in one candle** → counted as the stop (conservative).
- **Gap through a level** → exit recorded at the level price (TP or SL), not the candle open (v1
  simplification; the level is the trader's actual order price).
- **App closed** → the sim simply doesn't advance; no trades are missed *silently* because none are
  fetched. Accepted A.1 limitation, resolved by the A.2 server job.
- **Corrupt/old localStorage** → fall back to a fresh `initialSimState` (never throw on load).
- **riskPct ≤ 0 or non-finite** → `riskCredits` would be 0/NaN; guard `simStep` to skip opening when
  `riskCredits` is not a positive finite number.

## Testing

- `src/sim/engine.test.ts`: initial state; opens on authorized+armed+flat (long and short);
  won't open when unarmed, when a position is open, or when unauthorized; settle TP (long `high>=tp`
  → win `+rr`, credits up) and SL (long `low<=sl` → loss `-1`, credits down); short mirrors; **SL-first
  when both touched**; re-arm only on WAIT; **no re-open of the same setup until WAIT**; ids increment;
  non-finite/zero risk guard.
- `src/sim/stats.test.ts`: winRate / avgR / pnl / returnPct for a mixed set; all-zero empty state.
- `src/hooks/useSim.test.ts`: steps once per new candle time (not on re-render); does not step when
  `enabled` is false (demo); loads and persists via localStorage; `reset()` clears.
- `src/ui/SimPanel.test.tsx`: renders balance / win-rate / record; empty state copy; the PAPER label;
  no buy/order/execute control.

## Non-Goals (deferred)

- The 24/7 server cron + store (Phase A.2) — though the pure `simStep` is written to be reused there.
- Accounts / login / backend / cross-device sync (Phase C).
- Manual open/close ("trade it yourself") mode (Phase D).
- Per-pattern / per-veto analytics (Phase B).
- TP1 partial fills, breakeven stops, trailing stops, multiple concurrent positions, pyramiding.
- Spread / slippage / commission modeling (fills are at the exact level).
