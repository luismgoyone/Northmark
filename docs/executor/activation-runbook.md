# Executor Bot — Activation Runbook

How to turn the XAUUSD V2.7.1 execution bot on, in order. It ships **inert and safe**: with nothing configured it refuses everything. Two independent switches — the free signal pipeline, and the paid broker execution.

> **Never commit real secrets.** This repo is public. All secrets (`WEBHOOK_SECRET`, `METAAPI_TOKEN`, etc.) live only in Vercel env vars. Placeholders below use `<<ANGLE_BRACKETS>>`.

---

## The two ends
- **Webhook (INPUT) — free.** TradingView V2.7.1 → `POST /api/executor/webhook` → the bot receives, classifies, validates, and logs every decision. Runs in **stub** mode (logs "would execute", no broker).
- **MetaApi (OUTPUT) — paid (~$9/mo).** Turns the stub into real MT5-demo order placement.

---

## Phase 1 — Free signal pipeline (stub, no broker)

1. **Set the webhook secret** in Vercel → project `northmark` → Settings → Environment Variables (scope **Production**):
   - `WEBHOOK_SECRET = <<a strong random string>>`  (e.g. `openssl rand -hex 16`)
2. **Redeploy production** so it picks up the env var: publish a GitHub Release, or run the `release` workflow (`gh workflow run release.yml`). *(Develop does not auto-deploy — env changes need a fresh prod deploy.)*
3. **Verify it's live:**
   ```bash
   # no token → 401 (means the secret is set)
   curl -s "https://northmark-one.vercel.app/api/executor/logs" -w " [%{http_code}]\n"
   # valid long entry → ACCEPTED (stub)
   curl -s -X POST "https://northmark-one.vercel.app/api/executor/webhook" -H "content-type: application/json" \
     -d '{"secret":"<<WEBHOOK_SECRET>>","event_id":"t1","timestamp":"now","symbol":"XAUUSD","action":"buy","market_position":"long","prev_market_position":"flat","entry":4600,"sl":4593,"tp":4608.4,"lot":0.01}'
   ```
4. **Wire TradingView:** give your dad `docs/executor/tradingview-alert-handoff.md` (fill in the secret first). It appends an `alert()` block and creates one "Any alert() function call" alert pointing at the webhook URL.
5. **Watch signals:** `https://northmark-one.vercel.app/api/executor/logs?token=<<WEBHOOK_SECRET>>` — each shows ACCEPTED (with the event) or REJECTED (with a typed reason). No silent failures.

---

## Phase 2 — Real MT5-demo execution (paid, opt-in)

Do this ONLY when you want real demo fills. Cost: MetaApi ≈ **$0.0126/hr (~$9/mo)** while the account runs.

1. **Install the SDK** (it's dynamically imported and NOT in `package.json` by default):
   ```bash
   npm install metaapi.cloud-sdk
   ```
   Commit that and redeploy.
2. **Create a MetaApi account** (metaapi.cloud) and **connect an MT5 demo account** (login / master-trading password / server). Note its **Account ID** and generate an **API token**.
3. **Set Vercel env (Production):**
   - `EXEC_ENABLED = true`
   - `METAAPI_TOKEN = <<metaapi token>>`
   - `METAAPI_ACCOUNT_ID = <<metaapi account id>>`
   - `EXEC_BROKER_SYMBOL = <<XAUUSD or XAUUSDm or GOLD>>` (whatever your broker calls gold)
   - `EXEC_MAX_LOT = <<optional>>` — hard ceiling on order size in lots. **Default `0.10`** if unset. Any order above it is rejected `LOT`, so a bad payload can't size a large position (intended size is `0.01`).
   - **Leave `EXEC_ALLOW_LIVE` unset** — demo only. The bot refuses a non-demo account by default.
4. **Redeploy prod.** The webhook now routes through `MetaApiExecutor` (mode `live-demo`) instead of the stub.
5. **Confirm safe:** the bot won't place an order unless `EXEC_ENABLED=true` AND creds are set AND the connected account's server looks like a demo.

**Turn it back off** any time: set `EXEC_ENABLED=false` (or remove it) and redeploy → back to free stub mode. To stop MetaApi billing, undeploy/delete the account in MetaApi.

---

## Phase 3 — Reconciliation (drift safety net)

Once Phase 2 is live, poll:
```
GET https://northmark-one.vercel.app/api/executor/reconcile?token=<<WEBHOOK_SECRET>>
```
Compares the bot's position state vs the broker's actual positions and logs any drift (bot-thinks-open-but-broker-flat, direction mismatch, unexpected/multiple positions). Dormant-safe: returns `{enabled:false}` when execution is off. Wire it to a cron (e.g. a GitHub Action like `sim-tick.yml`) for continuous checking, or hit it manually.

The full audit trail (raw / acceptance / broker / reconcile) is at `GET /api/executor/logs?token=<<WEBHOOK_SECRET>>`.

---

## Safety summary
- Inert by default: no `WEBHOOK_SECRET` → endpoints 500/refuse; no `EXEC_ENABLED`+creds → stub only.
- Demo-only: refuses non-demo accounts unless `EXEC_ALLOW_LIVE=true` (don't set it).
- No silent failures: every signal → an acceptance record with an explicit outcome + typed reason.
- Secrets: Vercel env only, never in git (public repo).
