# Northmark × XAUUSD V2.7.1 — Complete Implementation Package

**Demo only · TradingView owns the strategy · Northmark executes + audits**
Objective: **one genuine, fully-audited automated demo trade.**

This is the single package. It has two halves:

- **Part 1 — TradingView (Dad + GPT do this).** Paste one alert block, create one alert.
- **Part 2 — Northmark (Luis does this).** Set secrets in Vercel, connect the MT5 demo, deploy.

Nothing here changes the V2.7.1 strategy. The alert block is **notification-only** — it announces the trades your strategy already makes; it places no orders itself and cannot affect your entries, exits, risk, or backtest.

---

## 0. Confirmed architecture

| Layer | Owner | Responsibility |
|---|---|---|
| **Strategy brain** | **TradingView V2.7.1** | H1/M15/M5 gates, breakout, stoch, volume, ATR risk, SL/TP, adaptive R:R, profit protection. **Source of truth for every trade decision.** |
| **Execution / safety / audit** | **Northmark** | Receive the signal TradingView fires → validate + classify (LONG/SHORT/EXIT) → size within a hard lot cap → place on **MT5 demo** → log every step, no silent failures → reconcile vs broker. |

Northmark does **not** recreate or replace the strategy. Elirox is **not** used.

---

# PART 1 — TRADINGVIEW SETUP (Dad + GPT)

### Step 1 — Open the V2.7.1 script
On TradingView → **Pine Editor** → your **XAUUSD V2.7.1** strategy loaded.

### Step 2 — Paste this block at the **very bottom** of the script
Paste below everything else. **Do not** add a second `//@version` line — keep the one at the top. Only one thing must be edited: replace `<<WEBHOOK_SECRET>>` with the secret Luis gives you (from Part 2, Step 1).

```pine
// ── Northmark webhook alerts — notification only; does NOT change the strategy ──
nmSecret = "<<WEBHOOK_SECRET>>"   // paste the Vercel WEBHOOK_SECRET here before use
nmLot    = "0.01"                 // broker lots per order (demo forward-test size)
nmAtr    = ta.atr(14)             // ATR length 14 (V2.7.1)
nmMult   = 1.5                    // ATR stop multiplier (V2.7.1)
nmRR     = 1.2                    // reward:risk (V2.7.1 forward-test)

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

**If your V2.7.1 uses different numbers**, change only the three lines `nmAtr = ta.atr(14)`, `nmMult = 1.5`, `nmRR = 1.2` to match your script.

### Step 3 — Save & add to chart
**Save** → **Add to chart**. It must compile with no red errors (it's `//@version=6`, same as your strategy).

### Step 4 — Create ONE alert
1. **Alert (⏰) → Create Alert.**
2. **Condition:** your **V2.7.1 strategy** → **"Any alert() function call"**.
3. **Expiration:** **Open-ended** (so it never stops).
4. **Notifications → Webhook URL**, paste exactly:
   ```
   https://northmark-one.vercel.app/api/executor/webhook
   ```
5. **Message:** leave as-is (the script fills it in). Do not type anything.
6. **Create.**

> **Interval note:** the alert is driven by `alert()` calls inside the strategy, so the chart timeframe you leave open doesn't change *which* trades fire — it mirrors exactly what V2.7.1 does. Keep the chart on the timeframe you normally run V2.7.1.

Done on the TradingView side. Every entry/exit now notifies Northmark.

---

# PART 2 — NORTHMARK SETUP (Luis)

Northmark ships **inert and safe**: with nothing configured it refuses everything. Two independent stages — the free signal pipeline, then paid broker execution.

### Step 1 — Turn on the signal pipeline (free, no broker)
1. Vercel → project `northmark` → **Settings → Environment Variables** (scope **Production**):
   - `WEBHOOK_SECRET = <a strong random string>` (e.g. `openssl rand -hex 16`) — **give this same value to Dad for the Pine block.**
2. **Redeploy production** (publish a GitHub Release, or `gh workflow run release.yml`). *Develop does not auto-deploy.*
3. Verify (stub mode — logs what it *would* trade, no orders):
   ```bash
   curl -s -X POST "https://northmark-one.vercel.app/api/executor/webhook" -H "content-type: application/json" \
     -d '{"secret":"<WEBHOOK_SECRET>","event_id":"t1","timestamp":"now","symbol":"XAUUSD","action":"buy","market_position":"long","prev_market_position":"flat","entry":4600,"sl":4593,"tp":4608.4,"lot":0.01}'
   # → ACCEPTED (stub)
   ```
4. Watch live signals: `https://northmark-one.vercel.app/api/executor/logs?token=<WEBHOOK_SECRET>`

### Step 2 — Connect the MT5 demo (paid, ~$9/mo, opt-in)
1. **Install the SDK** (kept out of the repo by default): `npm install metaapi.cloud-sdk`, commit, redeploy.
2. **MetaApi:** create an account at metaapi.cloud → connect your **MT5 demo** (login / server / trading password). Note the **Account ID** and generate an **API token**.
3. Vercel env (Production):

   | Variable | Value | Secret? |
   |---|---|---|
   | `EXEC_ENABLED` | `true` | no |
   | `METAAPI_TOKEN` | *(your MetaApi token)* | **YES — Vercel only** |
   | `METAAPI_ACCOUNT_ID` | *(your MetaApi account id)* | no (id, not a credential) |
   | `EXEC_BROKER_SYMBOL` | `XAUUSDm` (or whatever the broker calls gold) | no |
   | `EXEC_MAX_LOT` | *(optional)* hard lot cap, **default `0.10`** | no |
   | `EXEC_ALLOW_LIVE` | **leave unset** — demo only | no |
4. **Redeploy prod.** The webhook now routes through the real MT5-demo executor.

> **Credentials:** never put the MetaApi token (or any secret) in the repo or in TradingView. It goes **only** into Vercel Environment Variables. The repo is public.

---

## 3. Payload contract (what Northmark accepts)

One explicit, validated schema. Any missing/invalid field is **rejected with the exact field name** — no silent drop. (The old Elirox payload is intentionally rejected: it lacks `event_id`, `sl`, `tp`, `lot`.)

| Field | Meaning | How Pine fills it |
|---|---|---|
| `secret` | Shared secret; must match `WEBHOOK_SECRET` | `nmSecret` |
| `event_id` | Unique id per event → duplicate protection | `"<time>-XAUUSD-<action>"` |
| `timestamp` | Bar time | `str.tostring(time)` |
| `symbol` | TradingView symbol | `"XAUUSD"` |
| `action` | `buy` / `sell` | direction of the event |
| `market_position` | `long` / `short` / `flat` (new state) | strategy state |
| `prev_market_position` | previous state (enables reversal detection) | `nmPrev()` |
| `entry` | entry price | `strategy.position_avg_price` |
| `sl` | stop loss | long `e − ATR×1.5`, short `e + ATR×1.5` |
| `tp` | take profit | long `e + ATR×1.5×1.2`, short `e − ATR×1.5×1.2` |
| `lot` | broker lots | `"0.01"` |

## 4. Execution behavior (built + tested)

- **Symbol mapping:** `XAUUSD → XAUUSDm` (configurable via `EXEC_BROKER_SYMBOL`).
- **Lot validation + hard cap:** lot must be a finite number `> 0` **and ≤ the hard cap** (`EXEC_MAX_LOT`, default **0.10**). Anything above the cap is rejected `LOT` — a bad payload can never size a large order. (Intended size is 0.01.)
- **BUY / SELL / EXIT / reversal:** LONG_ENTRY, SHORT_ENTRY, LONG_EXIT, SHORT_EXIT are distinct events. A reversal (long→short or short→long) is handled as **EXIT then ENTRY**. No pyramiding — never stacks a second position.
- **Duplicate protection:** each `event_id` executes once; repeats are ignored and logged (24h window).
- **Demo-only safety — three independent switches**, all required before any real order:
  1. `EXEC_ENABLED=true`, **and**
  2. MetaApi token + account id present, **and**
  3. the connected account's server passes a **demo check** (a non-demo account is refused unless `EXEC_ALLOW_LIVE=true`, which we leave unset).

## 5. Full audit trail (§7 — every signal traceable)

All at `GET /api/executor/logs?token=<WEBHOOK_SECRET>`:

- **raw** — every incoming signal saved verbatim first (secret redacted), before anything else.
- **acceptance** — received → parsed → classified (LONG/SHORT/EXIT) → **accepted or rejected + typed reason**, with position state before/after.
- **broker** — order request → broker response → **ticket → status** (entry/SL/TP/lot on the request; the actual fill is read back from the demo position and surfaced via `reconcile`).
- **reconcile** — `GET /api/executor/reconcile?token=…` compares Northmark's state vs the broker's real positions and logs any drift.

## 6. Definition of a successful test (§8 — adopted verbatim)

> TradingView signal → Northmark receives → correctly classified → risk/SL/TP correct → demo order accepted → position visible → exit executed → complete result logged.

"Working" is **never** "webhook delivered." The full cycle must be visible in the logs.

## 7. Troubleshooting — what each failure means & what to check

| Symptom / log reason | Meaning | Check |
|---|---|---|
| **Webhook received but rejected** | Signal arrived, a check failed | Read the `acceptance` reason — it names the exact category below |
| `DATA: missing/invalid field: X` | Payload malformed | The Pine block is the current version; `X` field present & non-empty |
| `SIGNAL: invalid action` | `action` not `buy`/`sell` | Pine block unmodified |
| `SYMBOL: no broker symbol` | Symbol didn't map | `EXEC_BROKER_SYMBOL` matches the broker's gold symbol |
| `LOT: invalid lot` / `exceeds the hard cap` | Lot ≤ 0, non-finite, or above cap | Pine `nmLot`; `EXEC_MAX_LOT` if you raised size intentionally |
| `RISK: SL/TP …` | SL/TP missing or on the wrong side | Pine `entry/sl/tp` math (long: sl<entry<tp) |
| `DUPLICATE` | Same `event_id` seen already | Expected on retries — safe; just logged |
| `POSITION: …` | State conflict (e.g. stack attempt) | Reversal/flat sequence; reconcile vs broker |
| `BROKER: …` (rejection) | Broker refused the order | Broker log error code/description; symbol tradeable on demo; market open |
| Auth / API failure | MetaApi token/account bad | `METAAPI_TOKEN`, `METAAPI_ACCOUNT_ID`; account connected & demo |
| **TradingView alert not firing** | No signal reached Northmark | Alert exists, condition = "Any alert() function call", expiration open-ended, webhook URL exact; `raw` log empty confirms nothing arrived |
| Nothing happens but logs show ACCEPTED (stub) | Broker stage is still off | `EXEC_ENABLED=true` + creds set + prod redeployed |

## 8. Activation order (to get the one demo trade)

1. **Luis:** set `WEBHOOK_SECRET`, redeploy → verify stub receives the test curl. (Part 2, Step 1)
2. **Dad:** paste the block + create the alert with that secret. (Part 1)
3. **Both:** confirm a real V2.7.1 signal shows up in `raw`/`acceptance` as ACCEPTED (stub).
4. **Luis:** connect MetaApi MT5 demo, set `EXEC_ENABLED`+creds+`EXEC_BROKER_SYMBOL`, redeploy. (Part 2, Step 2)
5. **Wait for the next real V2.7.1 signal** (we do **not** force one). Bot places the demo order.
6. **Verify the full cycle** in the logs → success per §6. 🎯 One genuine, fully-audited demo trade.

---

**Northmark / XAUUSD V2.7.1 — Demo Only.** No live trading. No forced trades. Strategy preserved on TradingView.
