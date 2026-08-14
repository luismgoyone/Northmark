# Candle test fixtures

Known-input candle series for the indicator tests in Tasks 1.3–1.5 (EMA, stochastic,
swing points) and later gate/scoring tests. Each file is a JSON array of `Candle`
objects matching `src/types.ts`:

```ts
{ time: number; open: number; high: number; low: number; close: number; volume?: number }
```

`time` is a unix-seconds timestamp, ascending, spaced 300s apart (one M5 bar). Every
series has 30 candles, so a 9-period EMA (needs ≥9) and a 14-period stochastic
(needs ≥14, plus %K/%D smoothing) both have a valid, settled window at the tail.

## How the "expected" values were derived

Prefer the **qualitative** expectations below (slope direction, stochastic zone,
monotonicity, breakout/retest indices) — they are robust and verifiable by inspection.

The few **exact** numbers quoted are computed with the standard textbook formulas, not
guessed. If a future indicator implementation uses a different convention (e.g. a
different stochastic smoothing scheme or EMA seed), trust the qualitative property and
treat a mismatched exact number as a spec question, not an automatic bug. Reference
formulas used to produce the numbers:

- **EMA(period):** seed = SMA of the first `period` closes; then
  `EMA_i = close_i * k + EMA_{i-1} * (1 - k)` with `k = 2 / (period + 1)`
  (for period 9, `k = 0.2`). `slope` = sign of `EMA_last − EMA_prev`.
- **Stochastic(n=14, smooth=3, d=3):** raw `%K = (close − lowN) / (highN − lowN) * 100`
  over the last `n` bars; slow `%K = SMA(rawK, smooth)`; `%D = SMA(slowK, d)`.
  Zone thresholds assumed at the common **80 / 20** (overbought ≥ 80, oversold ≤ 20,
  else mid). If config picks different thresholds, re-check the zone label.

The magnitudes (5.0 vs 0.04) matter more than the exact digits: the flat series' EMA
slope is ~100× smaller than the trending series', so slope classification is not
threshold-fragile.

---

## 1. `rising.json` — clearly rising trend

Steady uptrend. `base = 2000 + i*5`; each candle is bullish (`close = base + 4`) and
every close is strictly greater than the previous.

- Closes: `2004 → 2149`, **strictly monotonically increasing** (+5 per bar).
- **EMA9 slope: rising.** Tail EMA9 ≈ `2129.00`, prev ≈ `2124.00`, slope ≈ **+5.0**.
- **Stochastic zone: overbought.** Closes sit at the top of every 14-bar range, so
  slow `%K ≈ 97.2`, `%D ≈ 97.2` (both ≥ 80).
- Swing points: none interior (monotonic) — expect the fractal detector to find no
  interior swing highs/lows, or only the trivial endpoints depending on its edge policy.

## 2. `falling.json` — clearly falling trend

Mirror of the rising series. `base = 2150 − i*5`; each candle is bearish
(`close = base − 4`); every close strictly less than the previous.

- Closes: `2146 → 2001`, **strictly monotonically decreasing** (−5 per bar).
- **EMA9 slope: falling.** Tail EMA9 ≈ `2021.00`, prev ≈ `2026.00`, slope ≈ **−5.0**.
- **Stochastic zone: oversold.** Closes sit at the bottom of every 14-bar range, so
  slow `%K ≈ 2.8`, `%D ≈ 2.8` (both ≤ 20).
- Swing points: none interior (monotonic).

## 3. `flat.json` — flat / consolidating (range-bound)

Symmetric oscillation with mean **exactly 2050**. Closes cycle `[2050, 2052, 2050,
2048, 2050]` and every candle shares the same `high = 2055` / `low = 2045` band, so all
30 candles **overlap** — a textbook consolidation. First and last close are both 2050.

- Closes stay inside a tight **`[2048, 2052]`** band; no trend.
- **EMA9 slope: flat.** EMA9 hugs ≈ `2049.8`; tail slope ≈ **+0.04** — about two orders
  of magnitude smaller than the trending series (±5.0). Expect the slope label `flat`
  under any sane threshold.
- **Stochastic zone: mid.** Because `%K = (close − 2045) / (2055 − 2045) * 100`
  oscillates between 30 and 70, slow `%K` and `%D` stay near the middle
  (tail slow `%K ≈ 43.3`, `%D ≈ 50.0`); never overbought/oversold.
- Useful as the negative case for any trend/consolidation gate (Phase 2 §2.2).

## 4. `breakout-retest.json` — base → breakout → pullback/retest

Resistance **level = 2100**. Structure by index:

| Index range | Phase | Behavior |
|-------------|-------|----------|
| `0`–`19`  | Base / consolidation | Closes bounce in `[2092, 2099]`; highs capped at `2099` so **no candle closes ≥ 2100** (and no wick pierces the level). |
| `20`      | **Breakout** | Bullish candle **closes at `2106`**, clearly above `2100` (comfortably beyond a small breakout buffer). |
| `21`–`23` | Follow-through | Continues up to ~`2109`. |
| `24`–`25` | **Retest** | Pulls back to the level: index `24` has `low = 2100` (touches the level exactly) and `close = 2101`; index `25` dips `low = 2099` and `close = 2103`. The level **holds** — closes stay above 2100. |
| `26`–`29` | Resume | Trends up to `2117`. |

Verified landmark facts (for gate tests in Task 1.6 breakout-close):

- **First close above the level (2100) is at index `20`** (`close = 2106`). All indices
  `0`–`19` close below 2100, so a *close-not-wick* breakout gate must be `wait`/`fail`
  before index 20 and `pass` at index 20.
- **Retest occurs at indices `24`–`25`** — price returns to interact with the broken
  level and holds above it (the "retest that holds" case for a Phase-2 retest gate).
- Because 30 candles end in an uptrend leg, tail indicators read: **EMA9 slope rising**
  (tail ≈ `2108.6`, prev ≈ `2106.5`, slope ≈ **+2.1**) and **stochastic overbought**
  (slow `%K ≈ 95.8`, `%D ≈ 88.2`). For pullback-specific assertions (e.g. "stochastic
  turning up out of a dip during the retest"), slice the series to the retest window
  (~indices 22–25) rather than reading the final bar.

---

### Quick reference

| Fixture | EMA9 slope | Stoch zone (tail) | Notable indices |
|---------|-----------|-------------------|-----------------|
| `rising.json`          | rising (≈ +5.0)  | overbought (≈ 97) | monotonic up |
| `falling.json`         | falling (≈ −5.0) | oversold (≈ 3)    | monotonic down |
| `flat.json`            | flat (≈ +0.04)   | mid (≈ 43)        | range `[2048,2052]` |
| `breakout-retest.json` | rising (≈ +2.1)  | overbought (≈ 96) | breakout @20, retest @24–25 (level 2100) |
