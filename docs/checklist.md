# XAUUSD M5 — Source Checklist (verbatim)

> Authoritative source of truth for gate + veto behavior (`quant-reviewer` checks against
> this). Transcribed verbatim from Luis' source. **Partial capture so far:** this is the
> NO-TRADE veto section (Appendix A step 13). The full 13-step entry sequence and the
> "This is critical:" continuation are not yet captured — see the gap note at the bottom.

## The AI must be allowed to say: WAIT

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

**This is critical:** _(continuation not captured in source screenshot — pending)_

---

## Capture gaps (pending from Luis)

1. The **13-step entry sequence** (BIAS → STRUCTURE → … → BUY) verbatim — summarized in the
   MVP design Appendix A but not transcribed here.
2. The **"This is critical:"** section that follows the NO-TRADE list.
3. The **golden rules** verbatim (partially in the MVP design).
