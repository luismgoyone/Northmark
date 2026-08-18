# XAUUSD Trading Strategy — Source Checklist (verbatim)

> Authoritative source of truth for gate + veto behavior (`quant-reviewer` checks against
> this). Transcribed verbatim from Luis' source. Two captures are folded together here:
> **(A)** the 13-step entry sequence (this file's top section, captured 2026-08-16), and
> **(B)** the NO-TRADE veto section captured earlier. See the reconciliation notes at the
> bottom for how this maps to the Phase-1 engine and the open flags it resolves.

---

## A. 13-Step Trading Rules (verbatim — source: `XAUUSD_Trading_Bot_13_Step_Rules-3.md`)

### Purpose

Convert our manually tested XAUUSD trading strategy into objective, machine-testable rules
for the trading bot.

The core sequence is:

**H1 Bias → Structure → No Consolidation → Identify Level → Breakout Close → Retest → Confirmation → Entry**

### Rules

| # | Gate | Rule |
|---|---|---|
| 1 | **Bias** | Use **H1** for the primary direction. Bullish when H1 structure is making higher highs/higher lows; bearish when making lower highs/lower lows. EMA alignment can support the bias but should not override clear structure. |
| 2 | **Structure** | Bullish structure = **at least 2 confirmed HH + 2 confirmed HL**. Bearish structure = **2 confirmed LH + 2 confirmed LL**. A swing must be confirmed, not simply an intrabar wick. |
| 3 | **Consolidation** | **NO TRADE** when price is clearly ranging: repeated highs/lows, overlapping candles, no clean directional progression, and price is trading in the middle of the range. Avoid initiating trades inside clear consolidation. |
| 4 | **Level ID** | For a bullish breakout, identify the **most recent significant/swing resistance high** that price must break. For bearish setups, identify the corresponding significant swing support low. |
| 5 | **Breakout** | A valid breakout requires a **closed candle body beyond the level**. A wick penetrating the level but closing back inside = **not a breakout**. |
| 6 | **Retest** | After the breakout, price must return toward the broken level. A valid bullish retest should interact with the former resistance and **hold it as support**; bearish is the opposite. |
| 7 | **Confirmation** | After the retest, require a confirmation candle showing continuation in the breakout direction. Do not enter merely because price touched the level. |
| 8 | **EMA Alignment** | EMA should support the direction of the trade. Avoid trades when the EMA is essentially flat or price is repeatedly crossing it. |
| 9 | **Entry** | Enter only after **breakout → retest → confirmation**, not on the initial breakout or anticipation. |
| 10 | **Stop Loss** | Place SL beyond the **structural invalidation point**, not an arbitrary fixed distance. |
| 11 | **Take Profit** | Target the next significant opposing level, while maintaining approximately **≥1:1.5 risk/reward** where the setup allows it. |
| 12 | **No-Trade Conditions** | Wick-only breakout, failed retest, consolidation, flat EMA, excessively extended candle, insufficient TP room, or SL that is too large for the available target. |
| 13 | **Position Sizing** | Size the position according to predetermined risk. **Never increase lot size to recover a previous loss.** |

### Important XAUUSD Pip Convention

Do not define monetary value from the pip convention alone.

Separate:

- **Price movement:** e.g. XAUUSD 4,378.00 → 4,378.20 = **$0.20 price movement**
- **Money/P&L:** depends on the broker's **contract size, tick size, tick value, and lot size**.

For bot logic, define breakout buffers and price-distance thresholds in **price units**,
rather than dollars. This keeps the strategy less broker-dependent.

If the broker's XAUUSD convention is 0.01 per pip:

**20 pips = 0.20 XAUUSD price movement.**

The bot should obtain the actual monetary consequence from the symbol's broker specifications.

### Critical Implementation Principle

Do **not** invent arbitrary numerical thresholds unless they have been explicitly tested
and approved.

For example, do not automatically define:

> Consolidation = price stays within 10 pips for 5 candles.

Unless this threshold has been deliberately selected and validated.

The strategy is primarily based on **market structure and price behavior**, not arbitrary
indicator thresholds.

### Core Decision Flow

> **Implementation note (2026-08-17):** the engine implements this flow via the **temporal
> narrative scan** — steps 4–6 ("identify level → close beyond → retest") are detected as a
> completed sequence across the candle window, so by the confirmation bar the broken level
> sits on the far side of price. See the design-spec addendum
> (`docs/superpowers/specs/2026-08-17-northmark-phase2-design.md`, "Temporal narrative
> model") for how `levelId`/`evaluateSetup` realize this. The steps below are the source
> intent; the addendum governs the mechanics.

1. Determine H1 directional bias.
2. Confirm market structure.
3. Check for consolidation.
4. If consolidation is present → **NO TRADE**.
5. Identify the relevant significant support/resistance level.
6. Wait for a candle to close beyond the level.
7. Reject wick-only breaks.
8. Wait for price to retest the broken level.
9. Determine whether the retest holds or fails.
10. Wait for confirmation in the breakout direction.
11. Check EMA alignment and remaining trade quality.
12. Calculate SL, TP, and risk/reward.
13. Calculate position size from predetermined risk.
14. Execute only if every required gate passes.

### Bot Philosophy

The bot should replicate the **decision process**, not simply search for indicator
combinations.

Indicators such as EMA can support the decision, but the primary logic is:

**Structure → Level → Breakout → Retest → Confirmation → Entry**

The bot should favor **NO TRADE** whenever the required conditions are not objectively
satisfied.

A missed trade is preferable to a low-quality trade.

---

## B. NO-TRADE veto section (verbatim — earlier capture)

### The AI must be allowed to say: WAIT

**Do not trade when:**

- Market is consolidating
- Price is in the middle of a range
- H1 direction is unclear
- No meaningful S/R exists
- Breakout has not been confirmed
- Retest hasn't occurred for the primary setup
- Confirmation is weak
- EMA20 strongly disagrees  _[CORRECTION per Luis 2026-08-14: this means **EMA9** — the
  system uses EMA9 throughout; "EMA20" was a typo. The veto is "EMA9 strongly disagrees".]_
- Risk/reward is insufficient
- TP is too close
- SL cannot logically be placed
- Price is excessively extended
- Spread is abnormal
- Volatility is abnormal
- Major news filter prohibits trading
- Daily loss limit reached
- Consecutive-loss limit reached
- Entry would be chasing

**This is critical:** _(continuation not captured in source screenshot — still pending)_

---

## Reconciliation notes (2026-08-16 — how Section A lands against the Phase-1 engine)

These are engineering notes, not part of the verbatim source.

1. **Pip→dollar convention — RESOLVED by Section A.** Broker convention is **0.01 per pip**
   (20 pips = 0.20 price movement). Buffers/thresholds stay in **price units**; monetary
   value comes from broker specs, never hardcoded. Closes the Phase-1 Tier-3 pip flag.
2. **Shorts are IN scope — Section A step 4 & the bearish structure rule are explicit.**
   `gates/riskReward.ts` and `scoring/risk.ts#takeProfits` currently assume long setups;
   they need direction-awareness before Phase 2 signals can be trusted for bearish setups.
3. **"Don't invent arbitrary thresholds" (Critical Implementation Principle).** The Phase-1
   Tier-2 defaults `consolidationLookback: 20` and `breakoutBufferPips: 20` are exactly the
   kind of untested magic numbers this principle warns against. They must be treated as
   **provisional/unvalidated** and, for Phase 2, consolidation should be driven by structure
   & price behavior (overlapping candles, flat EMA9, mid-range) rather than a fixed lookback.

## Capture gaps (still pending from Luis)

1. The **"This is critical:"** section that follows the NO-TRADE list (Section B) — still
   not captured. **quant-reviewer flag:** if it contains MORE NO-TRADE conditions, the veto
   count (18) is not final.
2. The **golden rules** verbatim (partially in the MVP design), if distinct from the above.
