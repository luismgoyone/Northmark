# Add live signal alerts to the XAUUSD V2.7.1 strategy — 4 steps, no coding

This adds webhook **alerts** to your existing TradingView V2.7.1 strategy so an external bot (Luis's) can mirror your trades onto a demo account. It is **notification-only** — it does **not** change your strategy, entries, exits, risk, or results. Nothing here needs editing — the secret and settings are already filled in. Just **paste one block at the bottom** and create one alert.

---

## Step 1 — Open your V2.7.1 script
On TradingView, open the **Pine Editor** (bottom panel) with your **XAUUSD V2.7.1** strategy loaded.

## Step 2 — Paste this block at the VERY BOTTOM of the script
Scroll to the end of your code and paste this **below everything** (do **not** add a second `//@version` line — keep the one already at the top). It's ready to go as-is:

```pine
// ── Northmark webhook alerts — notification only; does NOT change the strategy ──
// SL/TP come from YOUR strategy's own tradeRisk & tradeRR (adaptive R:R preserved) —
// Northmark does not recompute them. Assumes V2.7.1 declares script-level `tradeRisk`
// and `tradeRR` (as in your saved script). If yours are named differently, change only
// the two names below to match.
nmSecret = "<<WEBHOOK_SECRET>>"   // replace with the Vercel WEBHOOK_SECRET before use
nmLot    = "0.01"                 // broker lots per order (demo forward-test size)

nmJustLong  = strategy.position_size > 0  and strategy.position_size[1] <= 0
nmJustShort = strategy.position_size < 0  and strategy.position_size[1] >= 0
nmJustFlat  = strategy.position_size == 0 and strategy.position_size[1] != 0
nmPrev() => strategy.position_size[1] > 0 ? "long" : strategy.position_size[1] < 0 ? "short" : "flat"

nmMsg(a, mp, e, sl, tp) =>
    '{"secret":"' + nmSecret + '","event_id":"' + str.tostring(time) + "-XAUUSD-" + a +
    '","timestamp":"' + str.tostring(time) + '","symbol":"XAUUSD","action":"' + a +
    '","market_position":"' + mp + '","prev_market_position":"' + nmPrev() +
    '","entry":"' + str.tostring(e) + '","sl":"' + str.tostring(sl) +
    '","tp":"' + str.tostring(tp) + '","lot":"' + nmLot + '"}'

if nmJustLong
    e = strategy.position_avg_price
    // exact strategy levels: SL = entry − tradeRisk, TP = entry + tradeRisk × tradeRR
    alert(nmMsg("buy",  "long",  e, e - tradeRisk, e + tradeRisk * tradeRR), alert.freq_once_per_bar_close)
if nmJustShort
    e = strategy.position_avg_price
    alert(nmMsg("sell", "short", e, e + tradeRisk, e - tradeRisk * tradeRR), alert.freq_once_per_bar_close)
if nmJustFlat
    // EXIT: prices are placeholders — Northmark treats market_position=flat as CLOSE and ignores them
    wasLong = strategy.position_size[1] > 0
    alert(nmMsg(wasLong ? "sell" : "buy", "flat", close, close, close), alert.freq_once_per_bar_close)
```

## Step 3 — Save and add to the chart
Click **Save**, then **Add to chart**. If it compiles with no red errors, you're good. (It's `//@version=6`, same as your strategy.)

## Step 4 — Create ONE alert
1. Click the **Alert** (clock ⏰) button → **Create Alert**.
2. **Condition:** choose your **V2.7.1 strategy**, then **"Any alert() function call"**.
3. **Notifications tab → Webhook URL**, paste exactly:
   ```
   https://northmark-one.vercel.app/api/executor/webhook
   ```
4. Leave the **Message** box as-is (the script fills it in).
5. **Create.**

**Done.** Every time the strategy enters or exits, it now sends the signal to the bot. Tell Luis when it's set up.

---

### Notes
- **Safe:** these `alert()` calls only *announce* your trades — they place no orders and can't change your strategy's behavior or backtest.
- The bot is in **test mode** — it just logs what it *would* trade; it places **no real orders**.
- **SL/TP are your strategy's own values.** The block sends `entry − tradeRisk` / `entry + tradeRisk × tradeRR` — the exact initial levels V2.7.1 computes from its ATR risk and **Adaptive R:R**. Northmark does **not** recompute or hardcode any R:R. This requires that your script exposes `tradeRisk` and `tradeRR` as script-level variables (they are in the V2.7.1 code you shared). If your adaptive function names them differently, change only those two names in the block.
- **Profit protection is honored via the exit, not the level.** If your strategy moves the SL (profit lock) and exits early, that exit fires a `flat` event and Northmark closes the demo position — so the *realized* exit matches TradingView. The SL/TP placed on the order are a protective backstop only.
- **EXIT events:** on a `flat` event the entry/sl/tp are placeholders; Northmark treats `market_position=flat` as a **close** and never reads those numbers as new trade levels.
