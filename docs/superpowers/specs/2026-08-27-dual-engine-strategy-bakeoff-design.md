# Dual-Engine Strategy Bake-off — Design Spec

**Date:** 2026-08-27
**Status:** Approved for planning (Phase 1)
**Author:** Claude (with a senior-discretionary-trader consulting subagent for the domain criteria)

---

## 1. Purpose

Run a second, fully-automated trading strategy — **the "Claude" engine**, whose criteria,
patterns, and scoring are dictated by Claude from its own knowledge plus reputable trading
sources — **beside** the existing **"Dad + ChatGPT"** engine (the verbatim 13-step strategy),
against the *same* live XAUUSD M5 market feed, each with its **own paper-trading credit
account under identical economics**.

This turns Northmark into a live **A/B bake-off of two strategies**, which is exactly the
project's reason to exist: *validate a strategy against real market behavior before risking
real money.* The winner is decided by realized credit growth, win-rate, and expectancy over
time — not by opinion.

### Non-goals
- No real order execution. Both engines are paper/forward-test only (consistent with the app).
- No human-in-the-loop for the Claude engine. It is automated like the existing sim, so
  **self-attested psychology gates are out of scope** (a bot cannot report its emotional
  state). Only computable criteria are used, keeping the comparison apples-to-apples.
- No invented win-rate percentages anywhere in the UI. Copy hedges folklore-grade criteria
  and shows only each engine's own realized results.

---

## 2. Delivery shape

Not a new tab. Each **existing** tab grows a parallel, clearly-labeled section so the two
strategies sit side by side and can be compared directly.

Labels (confirmed): **"Dad + ChatGPT"** and **"Claude"**. Each section carries a subtle
distinct accent (built on the existing theme tokens, so it works in light and dark) so the
two versions are differentiable at a glance.

| Tab | "Dad + ChatGPT" section | "Claude" section |
|---|---|---|
| **Signal** | existing `TradeCard` + no-trade `VetoList` | verdict badge · A–F grade + score · section bars · veto strip · session clock · risk/expectancy |
| **Chart** | shared `PriceChart`; toggle each engine's entry/SL/TP markers | ← (same chart, per-engine markers) |
| **Paper** | existing `SimPanel` (balance, win-rate, record, history) | second `SimPanel` (own account) + win-rate-by-grade analytics |
| **Checklist** | verbatim 13-step (`docs/checklist.md`) | Claude checklist, honesty-labeled |

---

## 3. The Claude engine — criteria (I dictate these)

Computable-only. Vetoes gate; points grade. Two-stage evaluation so the score can't be gamed
by piling up soft points.

### 3.1 Stage 1 — Veto gate (binary)
If **any** veto fails → verdict is `NO-TRADE`, grade forced to **F**, and the UI shows the
single blocking reason. No weighted points can override a veto.

| Veto | Rule | Source |
|---|---|---|
| Bias | Trade direction must align with H1 bias | reuse `gates/bias` |
| Consolidation | Not in a clear range/chop | reuse `gates/consolidation` |
| Level | A tested S/R level defines the trade | reuse `gates/levelId` |
| Breakout close | Candle **closed** beyond the level (wick-only = fail) | reuse `gates/breakoutClose` |
| Confirmation | Confirmation candle in trade direction after retest | reuse `gates/confirmation` |
| Risk:Reward | R:R to first target ≥ 1.5 | reuse `gates/riskReward` |
| Structural SL | SL sits beyond the structural invalidation point | from engine setup |
| **News blackout** | No red-folder USD/gold event within ±30 min | **new** — `edge/newsWindow` + feed |
| Session dead-zone | Not in rollover/low-liquidity window; **Friday-late = veto** | **new** — `edge/session` |

### 3.2 Stage 2 — Weighted score (0–100), only if all vetoes pass

Psychology (10 pts in the original expert spec) is dropped as un-computable; the remaining
five sections are rescaled to sum to 100:

| Section | Weight | Weighted items (computable) |
|---|---|---|
| Bias & Context | **22** | M15/H1 structure agrees; price on correct side of EMA; no opposing H1 level within 1×ATR |
| Structure & Setup | **28** | retest occurred and held; entry not extended (distance-from-level / ATR, consecutive-candle count) |
| Confluence | **17** | stochastic not exhausted; ATR in a healthy band (not dead, not spiked); confluence count (level + EMA + round number), **capped at 3** |
| Timing | **16** | inside a high-expectancy session window (see §3.4) |
| Risk & Targets | **17** | R:R beyond the 1.5 floor (more R:R = more points); target sits before the next opposing level |

Each section scores its passed items as a fraction of its weight; sum → 0–100.

### 3.3 Grading, floors, and the trade decision

| Grade | Score | Meaning |
|---|---|---|
| **A** | 90–100 | A+ setup — take it |
| **B** | 78–89 | Solid — valid trade |
| **C** | 65–77 | Marginal — allowed but the data says pass |
| **D** | 50–64 | Weak — below standard |
| **F** | <50 **or any veto** | No trade |

- **Structure floor:** if the Structure section scores < 60% of its weight, cap the grade at
  **C** regardless of total (a pretty context/timing setup with sloppy structure is still bad).
- **Confluence cap:** C-section counts at most 3 confluences (no inflating with correlated
  indicators).
- **The engine places a paper trade only on grade A or B.** Low trade frequency is a feature,
  not a bug — it is one of the strategy's edges.

### 3.4 Session logic (DST-aware)

Gold volatility and follow-through concentrate in the **London session and the London–NY
overlap** (evidence-supported via ATR-by-hour; the "overlap is best for breakouts" claim is a
high-confidence heuristic, not a guaranteed number).

**Must be DST-aware:** drive windows off actual exchange local time (`Europe/London`,
`America/New_York`) via `Intl`, **not** hard-coded UTC, or the windows drift an hour half the
year. Display in Philippine time (UTC+8).

| Window | Quality | PH time (summer) |
|---|---|---|
| London–NY overlap | **Prime** | ~20:00–01:00 PHT |
| London morning | Good | ~16:00–20:00 PHT |
| London open | OK | ~15:00–16:00 PHT |
| NY afternoon | Selective | ~01:00–04:00 PHT |
| Rollover / late-NY | **Avoid** (veto) | ~04:00–06:00 PHT |
| Asian session | Low (range) | ~08:00–15:00 PHT |

Note: most red-folder USD data lands ~20:30–23:00 PHT — *inside* the prime window — so the
news veto is a **within-window** block, not a session block.

### 3.5 Honesty ledger (drives UI copy)
- **Evidence-supported:** position sizing / fixed-% risk, expectancy math, gold session-
  volatility concentration, R:R breakeven math, over-trading erodes returns.
- **Directional / widely-taught:** retest > naked breakout, confirmation-candle edge.
- **Folklore (weighted, never veto):** oscillator overbought/oversold. UI labels these as
  "supporting, not proven."

---

## 4. Architecture

One-way dependency direction preserved (`indicators → gates → scoring → sim → ui`; `edge`
composes engine outputs; UI imports down only).

### 4.1 New pure functions (TDD, `src/`)
| Unit | Responsibility |
|---|---|
| `indicators/atr.ts` (+test) | Average True Range over a candle window |
| `edge/session.ts` (+test) | DST-aware session classifier: timestamp → `{ window, quality }` |
| `edge/newsWindow.ts` (+test) | Pure: given `events[]` + `now`, is a red-folder event within ±30 min? |
| `edge/scoreSetup.ts` (+test) | Two-stage scorer: engine gates + edge inputs → `EdgeVerdict` |
| `edge/expectancy.ts` (+test) | Expectancy + breakeven-win-rate helpers for the UI widget |
| `edge/checklist.ts` | The Claude checklist as data (item text, section, veto/weight, honesty label) — feeds the Checklist tab |
| `scoring/evaluateSetupClaude.ts` (+test) | Composes the above into a verdict shaped for the forward-test (mirrors `evaluateSetup`'s contract: authorize + direction/entry/sl/tp/lot + grade/score) |

`EdgeVerdict` shape (sketch): a discriminated union like the existing `SetupVerdict` —
`{ status: 'wait'; blockedBy; ... }` or `{ status: 'setup'; direction; entry; sl; tp1; tp2;
lot; grade; score; sections; vetoes }`.

### 4.2 Sim changes (Phase 2)
- `advanceSim` (in `forwardTest.ts`) is parameterized by an **evaluator function** so the same
  forward-test machinery runs with either engine. No forked copy of the stepping logic.
- The server blob holds **two** states: `{ dad: SimBlobPart, claude: SimBlobPart }`. Each tick
  advances both on the same fetched candles.
- `/api/sim-state` returns both; `useServerSim` exposes both.
- `SimState`/`stats` are reused per engine. Each Claude trade is **tagged with its pre-trade
  grade + score** so stats can compute realized **win-rate by grade**.
- **Identical economics:** both accounts start from the same balance and use the same sizing,
  trade-limit, and credit rules — only the *decision* differs.

### 4.3 News feed (Phase 3)
- `api/news.ts` fetches an economic calendar from a free provider (candidate: Finnhub or
  Financial Modeling Prep free tier), filters to red-folder USD/gold events, caches in Redis.
- The server tick reads the cached events for the news veto.
- **Graceful degradation:** if the provider is unavailable, the news veto is *skipped* with a
  visible "news feed unavailable" indicator — never fabricated as pass, never a hard block.
  This keeps the bake-off running honestly when the feed is down.

### 4.4 UI
- **Signal tab** — a `StrategySection` wrapper (label + accent) renders the two columns/stacks.
  Claude side: `VerdictBadge`, `GradeScore`, `SectionBars`, `VetoStrip`, `SessionClock`,
  `RiskExpectancy`.
- **Chart tab** — shared `PriceChart` with per-engine marker toggles.
- **Paper tab** — second `SimPanel` bound to the Claude account + a `GradeAnalytics` panel.
- **Checklist tab** — `StrategySection` split: verbatim 13-step vs. the Claude checklist
  rendered from `edge/checklist.ts`, with honesty labels.
- Accent + labels are theme-token-based so light/dark both work.

---

## 5. Phasing (checkpoints between each)

- **Phase 1 — Signal + Checklist parity (compare live signals).**
  New pure functions (`atr`, `session`, `newsWindow` [pure, feed stubbed], `scoreSetup`,
  `expectancy`, `checklist`, `evaluateSetupClaude`), all TDD. Signal-tab sectioning + Claude
  signal components. Checklist-tab sectioning + Claude checklist. News veto uses a stubbed/
  empty event list until Phase 3.
  *Checkpoint: you can compare each engine's live verdict on the same candle.*

- **Phase 2 — Parallel paper forward-test.**
  Parameterize `advanceSim`; dual state in the blob + `/api/sim-state`; `useServerSim` exposes
  both; second `SimPanel`; per-trade grade tagging; chart markers.
  *Checkpoint: two credit accounts grow independently against the same market.*

- **Phase 3 — Real news feed + analytics.**
  `api/news.ts` + Redis cache wired into the news veto (graceful degradation); `GradeAnalytics`
  (realized win-rate/expectancy by grade).
  *Checkpoint: news-aware engine + self-validating by-grade stats.*

---

## 6. Risks & open questions

- **News provider choice/limits** (Phase 3): free tiers rate-limit; confirm a provider and key
  in `.env`. Graceful degradation (§4.3) contains the risk.
- **Server tick cost** (Phase 2): advancing two engines + extra HTTP (news) per tick — verify
  it stays within the existing tick/candle-fetch budget and Vercel limits.
- **Reset semantics:** resetting the forward-test must reset *both* accounts together so they
  stay comparable (same start point).
- **Fairness:** both engines must evaluate on the identical `MarketContext` each tick — no
  peeking at different candle windows.

---

## 7. Testing

- Every new pure function is TDD'd (Vitest), mirroring the existing `gates/`/`scoring/`
  coverage. `scoreSetup` gets table-driven cases: each veto in isolation, the structure floor,
  the confluence cap, and grade-threshold boundaries.
- `session` tests assert correct classification across the DST boundary (summer vs winter
  instants) — the specific bug the domain expert flagged.
- `evaluateSetupClaude` is verified against fixture `MarketContext`s (reuse `demo/presets`
  patterns) for both authorize and each blocked path.
- Behavioral UI checks for the sectioning and the Claude components, consistent with the
  existing `ui/*.test.tsx` style.
