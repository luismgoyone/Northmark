# Add live signal alerts to the XAUUSD V2.7.1 strategy — 4 steps, no coding

This adds webhook **alerts** to your existing TradingView V2.7.1 strategy so an external bot (Luis's) can mirror your trades onto a demo account. It is **notification-only** — it does **not** change your strategy, entries, exits, risk, or results. Nothing here needs editing — the secret and settings are already filled in. Just **paste one block at the bottom** and create one alert.

---

## Step 1 — Open your V2.7.1 script
On TradingView, open the **Pine Editor** (bottom panel) with your **XAUUSD V2.7.1** strategy loaded.

## Step 2 — Paste this block at the VERY BOTTOM of the script
Scroll to the end of your code and paste this **below everything** (do **not** add a second `//@version` line — keep the one already at the top). It's ready to go as-is:

```pine
// ── Northmark webhook alerts — notification only; does NOT change the strategy ──
nmSecret = "<<WEBHOOK_SECRET>>"   // replace with the Vercel WEBHOOK_SECRET before use
nmLot    = "0.01"
nmAtr    = ta.atr(14)              // ATR length 14 (V2.7.1)
nmMult   = 1.5                     // ATR stop multiplier (V2.7.1)
nmRR     = 1.2                     // reward:risk (V2.7.1 forward-test)

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
    r = nmAtr * nmMult
    alert(nmMsg("buy",  "long",  e, e - r, e + r * nmRR), alert.freq_once_per_bar_close)
if nmJustShort
    e = strategy.position_avg_price
    r = nmAtr * nmMult
    alert(nmMsg("sell", "short", e, e + r, e - r * nmRR), alert.freq_once_per_bar_close)
if nmJustFlat
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
- The block assumes ATR length **14**, stop multiplier **1.5**, reward:risk **1.2** (V2.7.1 forward-test values). If your script uses different numbers, change only these three lines: `nmAtr = ta.atr(14)`, `nmMult = 1.5`, `nmRR = 1.2`.
