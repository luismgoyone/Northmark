# Paper Trading — 24/7 Server Tick (Phase A.2) Design

**Date:** 2026-08-23
**Status:** Design — approved for planning
**Builds on:** Phase A.1 (client-only forward-test) — the pure `src/sim` reducer was written to be reused server-side, which this phase does.

## Motivation

A.1 records paper trades only while a browser tab is open, so it misses most of the market. A.2
makes the forward-test run **24/7 on the server** so it captures every setup around the clock, with
the record stored server-side (shared, not per-browser). This also finally makes the deferred
`daily-loss-limit` / `consecutive-loss-limit` vetoes evaluable later (the sim log is the source of
truth), and it's the substrate the accounts phase (C) will build on.

## Decisions locked (from brainstorming)

- **Scheduler:** a **GitHub Actions cron** (`*/5 * * * *`) pings a protected endpoint. Free on this
  public repo (unlimited Actions minutes).
- **Store:** **Vercel KV** (Upstash-backed Redis) — one key holds the sim blob.
- **Scope:** a **single shared "house" forward-test** (pre-accounts; per-user is Phase C).
- **Server owns ticking:** the client becomes a **read-only viewer** of the server record; A.1's
  client-side stepping is retired.
- **Cadence / budget:** tick every 5 min. Fetch **M5 every tick**, but **M15/H1 only when their
  candle has closed** (cache them in KV between fetches) → ~408 Twelve Data calls/day, under the
  ~800 free limit, so we normally never hit it.
- **Graceful limit handling:** when Twelve Data reports credits exhausted, the tick does not crash —
  it stamps `limitReachedAt`, skips stepping, and auto-resumes on the next successful tick (credits
  reset daily). The Paper panel shows an honest note while that's in effect.
- **Reset:** removed from the public UI (a shared record shouldn't be wipeable by any viewer);
  resetting is a protected admin action (curl the endpoint with the secret).

## Architecture

```
GitHub Actions (*/5 * * * *)
  └─ GET /api/sim-tick?token=SIM_TICK_SECRET
        1. auth (constant-time compare against SIM_TICK_SECRET)
        2. load SimBlob from Vercel KV (or init)
        3. fetch M5 (always); M15/H1 only if their interval elapsed since last fetch
           - on a Twelve Data "out of credits" error → stamp limitReachedAt, save, return 200
        4. build MarketContext { m5, m15, h1 }  (fresh M5 + fresh-or-cached M15/H1)
        5. advanceSim(blob.state, blob.lastProcessedTime, ctx, config)  [PURE]
        6. save updated SimBlob to KV (clear limitReachedAt, stamp updatedAt)

Client (SimPanel, in the Paper tab)
  └─ GET /api/sim-state  (on mount + poll ~60s) → { state, stats, meta } → render
```

### Vercel KV blob

One key, `sim:v1`:

```ts
type SimBlob = {
  state: SimState                 // the pure sim state (from src/sim/types)
  lastProcessedTime: number | null // latest M5 candle time already stepped (dedup)
  m15: Candle[]                    // cached higher-timeframe candles…
  h1: Candle[]                     // …reused between their boundary fetches
  m15FetchedAt: number | null
  h1FetchedAt: number | null
  limitReachedAt: number | null    // epoch ms the provider limit was last hit (null when healthy)
  updatedAt: number | null         // epoch ms of the last successful step
}
```

### Shared, testable orchestration — `src/forwardTest.ts` (new)

A layer ABOVE `sim` and `scoring` (so `src/sim` stays pure, importing only `types`). Reused by the
server tick and by tests. Pure — no I/O, no clock.

```ts
// Maps an engine verdict to the sim's narrow signal (moved out of the A.1 hook).
export function verdictToSignal(verdict: SetupVerdict): SetupSignal

// Steps the reducer over EVERY M5 candle newer than `lastProcessedTime`, using the verdict
// computed once from the full current context. Returns the advanced state + new watermark.
// Looping over new candles makes it robust to delayed/missed ticks — no candle (or exit) is
// skipped; a batch just gets processed on the next run.
export function advanceSim(
  state: SimState,
  lastProcessedTime: number | null,
  ctx: MarketContext,
  config: Config,
): { state: SimState; lastProcessedTime: number | null }
```

Note (documented approximation): `advanceSim` computes the verdict once from the current full
context and applies it to each new M5 candle. Exits (`settle`) are per-candle-accurate (they only
read the candle's high/low); opens use the current verdict. This is correct for a history/win-rate
tool and keeps the tick cheap.

### Shared candle parser — `src/data/parseCandles.ts` (new)

Extract the pure parse (`normalizeValue` + `parseUtcMillis`) out of `src/data/twelveData.ts` into a
shared `parseTwelveData(payload): Candle[]`. `twelveData.ts` (client) imports it; the server tick
imports it too — one parser, no drift.

### Server Twelve Data fetch — `api/_twelvedata.ts` (new; underscore = not a route)

`fetchTwelveData(interval, outputsize): Promise<TwelveDataResponse>` — builds the URL exactly like
`api/candles.ts` (symbol · interval · outputsize · **timezone=UTC** · apikey from
`process.env.TWELVEDATA_KEY`), fetches, returns the parsed JSON. `api/candles.ts` is refactored to
use it (removes the duplicated URL-building). Exposes a helper `isCreditLimitError(payload)` that
recognizes Twelve Data's credit/rate errors (HTTP 429 or `status:'error'` with a code/message
indicating API credits) so the tick can degrade gracefully.

### `api/sim-tick.ts` (protected)

Thin handler:
1. Reject unless `req.query.token` equals `process.env.SIM_TICK_SECRET` (constant-time compare; 401
   otherwise). Missing secret env → 500.
2. Load `SimBlob` from KV (or `initBlob()` on first run).
3. Fetch M5 (`outputsize` ~200). Fetch M15/H1 only if `now − *FetchedAt ≥ intervalMs` (pure helper
   `isDue(intervalMs, fetchedAt, now)`); else reuse the cached arrays.
   - If any fetch returns a credit-limit error → set `limitReachedAt = now`, save the blob, return
     `200 { ok: true, limited: true }`. Do not step.
4. Build `MarketContext` and call `advanceSim`.
5. Save the blob: new `state`, `lastProcessedTime`, refreshed caches/fetch times, `limitReachedAt =
   null`, `updatedAt = now`. Return `200 { ok: true, trades, balance }`.
   - Any unexpected error → 500 with a short message; the next cron run retries.

### `api/sim-state.ts` (public read)

Loads the `SimBlob` from KV and returns `{ state, stats: simStats(state), meta: { limitReachedAt,
updatedAt } }`. No auth (paper data; harmless). Sets `Cache-Control: s-maxage=30` to soften load. If
KV is empty, returns a fresh/empty state so the client renders the empty panel.

### Admin reset — `api/sim-tick.ts?reset=1&token=…`

When `reset=1` and the token is valid, overwrite the blob with `initBlob()` and return. Keeps reset
protected and off the public UI.

### GitHub Actions — `.github/workflows/sim-tick.yml`

```yaml
on:
  schedule: [{ cron: '*/5 * * * *' }]
  workflow_dispatch: {}
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS "https://northmark-one.vercel.app/api/sim-tick?token=$SECRET"
        env: { SECRET: ${{ secrets.SIM_TICK_SECRET }} }
```

The secret lives only as a GitHub Actions repo secret and a Vercel env var — never in the workflow
file, the client, or logs. `workflow_dispatch` allows a manual run.

### Client — `src/hooks/useServerSim.ts` (new), replacing `useSim`

`useServerSim(): { state, stats, meta: { limitReachedAt, updatedAt }, loading }` — fetches
`/api/sim-state` on mount and polls every ~60s (via `setInterval`, cleaned up on unmount). Read-only;
no stepping, no localStorage. On fetch failure it keeps the last good state (never blanks). The old
`src/hooks/useSim.ts` + `useSim.test.ts` are **removed**; `verdictToSignal` moves to
`src/forwardTest.ts`.

### `SimPanel` changes

- Remove the **Reset** button and `onReset` prop (shared record; reset is admin-only now).
- Add an optional honest note when `meta.limitReachedAt` is set and newer than `updatedAt`:
  *"Data limit reached at {PHT time} — updates resume after the provider's daily reset."*
- Everything else (balance / win-rate / record / avg-R / trades) unchanged.

### `App.tsx`

Swap `useSim(...)` for `useServerSim()`; the Paper tab renders `<SimPanel state stats note />` from
it. The A.1 local-sim wiring (verdict-driven `useSim`, `LOADING_VERDICT` for the sim) is removed; the
verdict is still computed for the rest of the UI as today.

## Budget & limit handling (summary)

Normal day: M5×288 + M15×96 + H1×24 = **408 calls/day** < ~800 free. The daily budget is shared with
any open client's live chart/verdict polling, so a heavy-usage day can still exhaust it — handled
gracefully by the `limitReachedAt` note + auto-resume after the provider's daily reset.

## Security

- `TWELVEDATA_KEY`, KV creds (`KV_REST_API_URL`/`KV_REST_API_TOKEN`), and `SIM_TICK_SECRET` are all
  server-side env only; none ship to the client bundle.
- The tick + admin-reset are token-protected (constant-time compare). The read endpoint is public and
  returns only paper data.
- Verified by the existing pattern: `grep dist/` shows no secrets in the client build.

## Provisioning (Luis does; I provide exact steps)

1. Vercel dashboard → **Storage → create a KV store**, link it to the project (auto-injects
   `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
2. Generate a random `SIM_TICK_SECRET`; add it as a **Vercel env var** and as a **GitHub Actions
   repo secret** of the same name.
3. Redeploy. (The workflow + code ship in the PR.)

## Testing

- `src/forwardTest.test.ts`: `verdictToSignal` mapping; `advanceSim` steps over only new candles
  (dedup by watermark), records exits per-candle, is a no-op when no candle is newer, and handles the
  empty/first-run state. Uses the existing sim + candle fixtures.
- `src/data/parseCandles.test.ts`: the extracted parser (UTC datetime → epoch ms, ascending sort,
  numeric fields, optional volume) — port the coverage from `twelveData.test.ts`.
- `api/_twelvedata.test.ts`: `isDue` boundary helper; `isCreditLimitError` recognizes the provider's
  credit/rate error shapes and ignores normal errors.
- `src/hooks/useServerSim.test.ts`: fetches `/api/sim-state` on mount (mocked fetch), returns
  state/stats/meta, keeps last-good on a failed poll, cleans up its interval on unmount.
- `src/ui/SimPanel.test.tsx`: update — no Reset button; renders the data-limit note when
  `limitReachedAt > updatedAt`, hides it otherwise.
- Serverless handlers (`api/sim-tick.ts`, `api/sim-state.ts`) stay thin wrappers over the tested pure
  helpers; not unit-tested in jsdom (verified by the post-deploy smoke below).

## Verification

- Full unit suite green, typecheck + eslint clean, build succeeds.
- Post-deploy smoke: `curl /api/sim-tick?token=…` returns `{ ok: true }` and advances KV; a second
  immediate call is a no-op (watermark dedup); `curl /api/sim-state` returns the state; the Paper tab
  shows the server record (and the limit note when forced).

## Non-Goals (deferred)

- Accounts / login / per-user sims (Phase C) — this is one shared house record.
- The manual "trade it yourself" mode (Phase D).
- Per-pattern / per-veto analytics (Phase B).
- Wiring the loss-limit vetoes to the sim log (a later, small follow-up once the server log exists).
- Backfilling history from before A.2 goes live.
