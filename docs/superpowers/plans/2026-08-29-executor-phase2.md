# Executor Bot — Phase 2 Implementation Plan (MetaApi MT5-demo execution)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the Phase-1 stub with a real **MetaApi** executor that mirrors TradingView onto an **MT5 demo** account — open a market position with SL/TP on an entry alert, close it on an exit alert — with a hard **demo-only + EXEC_ENABLED** gate, full broker-response logging, and a reversal-safety fix (validate all legs before executing any). Ships **dormant** (no creds → stub path), so it deploys safely and activates only when the user wires MetaApi.

**Architecture:** Pure `orderParams.ts` (BrokerOrder → market-order args + sanitized clientId) and `gate.ts` (env → enabled/reason). `metaapi.ts` implements the existing `Executor` interface using a **dynamic `import('metaapi.cloud-sdk')`** behind a minimal local interface (so typecheck/build need no new dependency). The webhook handler picks `MetaApiExecutor` when the gate is enabled, else `StubExecutor`. The pipeline pre-validates all entry orders before executing any leg and logs every broker outcome.

**Tech Stack:** TypeScript (strict, NodeNext `.js`), Vitest, Vercel serverless, Upstash Redis, MetaApi (runtime-only, dynamic import).

## Global Constraints
- **Demo-only, dormant-by-default.** No order is ever placed unless BOTH `EXEC_ENABLED==='true'` AND MetaApi creds are present. Additionally, refuse a non-demo account (server name not matching `/demo/i`) unless `EXEC_ALLOW_LIVE==='true'` — logged loudly.
- MetaApi is imported **dynamically at runtime** (`await import('metaapi.cloud-sdk')`), never statically. Do NOT add it to `package.json` in this phase (keeps build green with no install). If the import fails (not installed), the executor returns an `ExecOutcome{status:'error'}` with a `BROKER` reason — never throws.
- **Reversal safety:** for a reversal `[EXIT, ENTRY]`, validate the ENTRY order BEFORE executing the EXIT leg; if validation fails, REJECT with no broker action.
- No silent failures (unchanged): `handleSignal` never throws; broker errors become `ExecOutcome{status:'error'}` + a broker-log record + a REJECTED-or-ACCEPTED-with-warning acceptance record.
- `exec:*` namespacing; no `src/` imports; NodeNext `.js`. Final gate green.

## Carry-in from Phase 1 review
- Validate-all-before-execute (this phase, Task 3).
- Mid-reversal broker-leg failure (close ok, open fails) can't be transactional with any broker — set state to what actually executed, log a `BROKER` error + a `reconcileNeeded` flag; Phase 3 reconciles.

---

### Task 1: `orderParams` — BrokerOrder → market-order args (pure)

**Files:** Create `executor/orderParams.ts` (+`executor/orderParams.test.ts`).
**Interfaces:**
```ts
export type MarketOrderReq = { side: 'buy' | 'sell'; symbol: string; volume: number; stopLoss: number; takeProfit: number; clientId: string }
export function buildMarketOrder(order: BrokerOrder, eventId: string): MarketOrderReq
export function sanitizeClientId(eventId: string): string  // [A-Za-z0-9_], ≤ 25 chars
```

- [ ] **Step 1: Failing test**
```ts
// executor/orderParams.test.ts
import { describe, expect, it } from 'vitest'
import { buildMarketOrder, sanitizeClientId } from './orderParams'
import type { BrokerOrder } from './types'

const long: BrokerOrder = { symbol: 'XAUUSDm', direction: 'long', entry: 100, sl: 99, tp: 101.2, lot: 0.01 }

describe('buildMarketOrder', () => {
  it('maps a long → market buy with sl/tp/volume and a sanitized clientId', () => {
    expect(buildMarketOrder(long, '2026-08-29T00:00:00Z-XAUUSD-buy')).toEqual({
      side: 'buy', symbol: 'XAUUSDm', volume: 0.01, stopLoss: 99, takeProfit: 101.2,
      clientId: sanitizeClientId('2026-08-29T00:00:00Z-XAUUSD-buy'),
    })
  })
  it('maps a short → market sell', () => {
    expect(buildMarketOrder({ ...long, direction: 'short', sl: 101, tp: 98.8 }, 'e').side).toBe('sell')
  })
})
describe('sanitizeClientId', () => {
  it('keeps only [A-Za-z0-9_] and caps length at 25', () => {
    const c = sanitizeClientId('2026-08-29T00:00:00Z-XAUUSD-buy:extra!!')
    expect(c).toMatch(/^[A-Za-z0-9_]+$/)
    expect(c.length).toBeLessThanOrEqual(25)
  })
})
```
- [ ] **Step 2: Run** `npx vitest run executor/orderParams.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
// executor/orderParams.ts
import type { BrokerOrder } from './types.js'

export type MarketOrderReq = { side: 'buy' | 'sell'; symbol: string; volume: number; stopLoss: number; takeProfit: number; clientId: string }

/** MetaApi clientId must be [A-Za-z0-9_] and short. Replace others with '_' and cap at 25. */
export function sanitizeClientId(eventId: string): string {
  return eventId.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 25)
}

export function buildMarketOrder(order: BrokerOrder, eventId: string): MarketOrderReq {
  return {
    side: order.direction === 'long' ? 'buy' : 'sell',
    symbol: order.symbol,
    volume: order.lot,
    stopLoss: order.sl,
    takeProfit: order.tp,
    clientId: sanitizeClientId(eventId),
  }
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(executor): market-order param mapping + clientId sanitize`

---

### Task 2: `executionGate` — env → enabled/reason (pure)

**Files:** Create `executor/gate.ts` (+`executor/gate.test.ts`).
**Interfaces:** `executionGate(env: Record<string,string|undefined>): { enabled: boolean; reason: string }`

- [ ] **Step 1: Failing test**
```ts
// executor/gate.test.ts
import { describe, expect, it } from 'vitest'
import { executionGate } from './gate'

describe('executionGate', () => {
  it('dormant unless EXEC_ENABLED === "true"', () => {
    expect(executionGate({}).enabled).toBe(false)
    expect(executionGate({ EXEC_ENABLED: 'false' }).enabled).toBe(false)
  })
  it('needs MetaApi creds when enabled', () => {
    expect(executionGate({ EXEC_ENABLED: 'true' }).enabled).toBe(false)
    expect(executionGate({ EXEC_ENABLED: 'true', METAAPI_TOKEN: 't', METAAPI_ACCOUNT_ID: 'a' }).enabled).toBe(true)
  })
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
```ts
// executor/gate.ts
export function executionGate(env: Record<string, string | undefined>): { enabled: boolean; reason: string } {
  if (env.EXEC_ENABLED !== 'true') return { enabled: false, reason: 'EXEC_ENABLED is not true (dormant)' }
  if (!env.METAAPI_TOKEN || !env.METAAPI_ACCOUNT_ID) return { enabled: false, reason: 'missing METAAPI_TOKEN/METAAPI_ACCOUNT_ID' }
  return { enabled: true, reason: 'enabled' }
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(executor): execution gate (dormant unless enabled + creds)`

---

### Task 3: Pipeline — validate-all-before-execute + broker logging

**Files:** Modify `executor/pipeline.ts`; extend `executor/pipeline.test.ts`.
**Change:** After `classify`, split events into legs. For every **entry** event, call `validateEntry` UP FRONT (collect `BrokerOrder`s) — any throw → REJECT before ANY execution. Then execute legs in order: exits → `executor.closePosition`; entries → `executor.openPosition(order)`. After each execution, `store.appendBroker({ eventId, event: e.type, outcome })` and, if `outcome.status==='error'`, record a `BROKER` reason and stop further legs. Thread + persist state per successfully-applied event.

- [ ] **Step 1: Add a failing test** (reversal validation happens before any execute)
```ts
// add to executor/pipeline.test.ts
it('reversal with a bad entry rejects WITHOUT closing (validate-all-before-execute)', async () => {
  const store = memStore()
  // open LONG first
  await handleSignal(body({ event_id: 'o', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 }), deps(store))
  const closes: string[] = []
  const spyExec = { openPosition: async () => ({ status: 'stub' as const, detail: 'o' }), closePosition: async () => { closes.push('closed'); return { status: 'stub' as const, detail: 'c' } } }
  // reversal long→short but the SHORT entry has SL/TP missing → must reject, and must NOT have closed
  const rec = await handleSignal(body({ event_id: 'r', action: 'sell', market_position: 'short', prev_market_position: 'long' /* no entry/sl/tp */ }), { store, executor: spyExec, secret: 'S', now: 2 })
  expect(rec.outcome).toBe('REJECTED')
  expect(closes).toHaveLength(0) // the exit leg never executed
})
```
- [ ] **Step 2: Run** → FAIL (current pipeline executes the exit before validating the entry).
- [ ] **Step 3: Implement** the reorder: build+validate all entry orders first (map event→order), then execute. Keep the single-event and normal-entry/exit paths behaving as before (existing tests stay green). Add `appendBroker` after each execution.
- [ ] **Step 4: Run** `npx vitest run executor/pipeline.test.ts` → PASS (new + existing).
- [ ] **Step 5: Commit** `feat(executor): validate all legs before executing + broker logging`

---

### Task 4: `MetaApiExecutor` (dynamic SDK, demo gate)

**Files:** Create `executor/metaapi.ts`. (Light unit test with a mocked connection: `executor/metaapi.test.ts`.)
**Interfaces:** `class MetaApiExecutor implements Executor` — constructed with `{ token, accountId, symbol, allowLive }`.

- [ ] **Step 1: Failing test (mock the connection, no real SDK)**
```ts
// executor/metaapi.test.ts
import { describe, expect, it } from 'vitest'
import { executeWith } from './metaapi'  // pure helper that takes a connection-like object

const fakeConn = {
  calls: [] as string[],
  async createMarketBuyOrder(sym: string, vol: number, sl: number, tp: number) { this.calls.push(`buy ${sym} ${vol} ${sl} ${tp}`); return { orderId: '111', stringCode: 'TRADE_RETCODE_DONE' } },
  async createMarketSellOrder(sym: string, vol: number, sl: number, tp: number) { this.calls.push(`sell ${sym} ${vol} ${sl} ${tp}`); return { orderId: '222', stringCode: 'TRADE_RETCODE_DONE' } },
  async closePositionsBySymbol(sym: string) { this.calls.push(`close ${sym}`); return { orderId: '333', stringCode: 'TRADE_RETCODE_DONE' } },
}

describe('executeWith', () => {
  it('opens a long via createMarketBuyOrder and returns sent+ticket', async () => {
    const c = { ...fakeConn, calls: [] as string[] }
    const r = await executeWith(c, { kind: 'open', order: { symbol: 'XAUUSDm', direction: 'long', entry: 100, sl: 99, tp: 101, lot: 0.01 }, eventId: 'e' })
    expect(r.status).toBe('sent'); expect(r.ticket).toBe('111')
    expect(c.calls[0]).toMatch(/^buy XAUUSDm 0.01 99 101/)
  })
  it('closes via closePositionsBySymbol', async () => {
    const c = { ...fakeConn, calls: [] as string[] }
    const r = await executeWith(c, { kind: 'close', symbol: 'XAUUSDm', direction: 'long', eventId: 'e' })
    expect(r.status).toBe('sent'); expect(c.calls[0]).toBe('close XAUUSDm')
  })
  it('maps a thrown broker error to status error (never throws)', async () => {
    const c = { async createMarketBuyOrder() { throw new Error('TRADE_RETCODE_REJECT') } }
    const r = await executeWith(c as never, { kind: 'open', order: { symbol: 'XAUUSDm', direction: 'long', entry: 100, sl: 99, tp: 101, lot: 0.01 }, eventId: 'e' })
    expect(r.status).toBe('error'); expect(r.detail).toMatch(/REJECT/)
  })
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — a pure `executeWith(connection, action)` (tested above) plus the SDK-connecting class around it:
```ts
// executor/metaapi.ts
import type { BrokerOrder } from './types.js'
import type { Executor, ExecOutcome } from './ports.js'
import { buildMarketOrder } from './orderParams.js'

// Minimal shape of the MetaApi RPC connection we use (avoids a static dep on the SDK types).
type RpcConnection = {
  createMarketBuyOrder(symbol: string, volume: number, sl: number, tp: number, options?: unknown): Promise<{ orderId?: string; stringCode?: string }>
  createMarketSellOrder(symbol: string, volume: number, sl: number, tp: number, options?: unknown): Promise<{ orderId?: string; stringCode?: string }>
  closePositionsBySymbol(symbol: string): Promise<{ orderId?: string; stringCode?: string }>
}
type Action =
  | { kind: 'open'; order: BrokerOrder; eventId: string }
  | { kind: 'close'; symbol: string; direction: 'long' | 'short'; eventId: string }

/** Pure over a connection: perform one action, map result/error → ExecOutcome. Never throws. */
export async function executeWith(conn: RpcConnection, action: Action): Promise<ExecOutcome> {
  try {
    if (action.kind === 'open') {
      const req = buildMarketOrder(action.order, action.eventId)
      const res = req.side === 'buy'
        ? await conn.createMarketBuyOrder(req.symbol, req.volume, req.stopLoss, req.takeProfit, { clientId: req.clientId })
        : await conn.createMarketSellOrder(req.symbol, req.volume, req.stopLoss, req.takeProfit, { clientId: req.clientId })
      return { status: 'sent', detail: `open ${req.side} ${req.symbol} (${res.stringCode ?? 'ok'})`, ticket: res.orderId }
    }
    const res = await conn.closePositionsBySymbol(action.symbol)
    return { status: 'sent', detail: `close ${action.symbol} (${res.stringCode ?? 'ok'})`, ticket: res.orderId }
  } catch (err) {
    return { status: 'error', detail: err instanceof Error ? err.message : 'broker error' }
  }
}

/** Real executor: lazily connects (cached) to MetaApi MT5 demo and mirrors orders. Demo-gated. */
export class MetaApiExecutor implements Executor {
  private conn: RpcConnection | null = null
  constructor(private cfg: { token: string; accountId: string; symbol: string; allowLive: boolean }) {}

  private async connection(): Promise<RpcConnection> {
    if (this.conn) return this.conn
    // Dynamic import so the SDK is only loaded when execution is actually enabled.
    const mod = (await import('metaapi.cloud-sdk')) as unknown as { default: new (t: string) => { metatraderAccountApi: { getAccount(id: string): Promise<MetaAccount> } } }
    const MetaApi = mod.default
    const api = new MetaApi(this.cfg.token)
    const account = await api.metatraderAccountApi.getAccount(this.cfg.accountId)
    await account.waitConnected()
    // Demo-only guard: refuse a non-demo server unless explicitly allowed.
    const server = String(account.server ?? '')
    if (!/demo/i.test(server) && !this.cfg.allowLive) {
      throw new Error(`refusing execution on non-demo account (server="${server}"); set EXEC_ALLOW_LIVE=true to override`)
    }
    const conn = account.getRPCConnection()
    await conn.connect()
    await conn.waitSynchronized()
    this.conn = conn as unknown as RpcConnection
    return this.conn
  }

  async openPosition(order: BrokerOrder, eventId: string): Promise<ExecOutcome> {
    try { return await executeWith(await this.connection(), { kind: 'open', order, eventId }) }
    catch (err) { return { status: 'error', detail: `metaapi connect/open failed: ${err instanceof Error ? err.message : err}` } }
  }
  async closePosition(direction: 'long' | 'short', eventId: string): Promise<ExecOutcome> {
    try { return await executeWith(await this.connection(), { kind: 'close', symbol: this.cfg.symbol, direction, eventId }) }
    catch (err) { return { status: 'error', detail: `metaapi connect/close failed: ${err instanceof Error ? err.message : err}` } }
  }
}

type MetaAccount = {
  server?: string
  waitConnected(): Promise<void>
  getRPCConnection(): { connect(): Promise<void>; waitSynchronized(): Promise<void> } & RpcConnection
}
```
> The closePosition takes the broker symbol from `cfg.symbol` (map with `symbolFor` at construction). If the exact MetaApi method names differ once installed, adjust the `RpcConnection` type + calls — they're confirmed against the current JS SDK docs (createMarketBuyOrder/SellOrder(symbol, volume, sl, tp, options); closePositionsBySymbol(symbol)).
- [ ] **Step 4: Run** `npx vitest run executor/metaapi.test.ts && npm run typecheck` → PASS (the dynamic import is untyped/`unknown`-cast so typecheck needs no installed dep).
- [ ] **Step 5: Commit** `feat(executor): MetaApiExecutor (dynamic SDK import, demo-gated)`

---

### Task 5: Wire the webhook to select the executor

**Files:** Modify `api/executor/webhook.ts`. (No unit test; typecheck+build.)
**Change:** Choose the executor from the gate:
```ts
import { executionGate } from '../../executor/gate.js'
import { MetaApiExecutor } from '../../executor/metaapi.js'
import { StubExecutor } from '../../executor/executor.js'
import { symbolFor } from '../../executor/validate.js'
// ...
const gate = executionGate(process.env)
const executor = gate.enabled
  ? new MetaApiExecutor({ token: process.env.METAAPI_TOKEN!, accountId: process.env.METAAPI_ACCOUNT_ID!, symbol: symbolFor('XAUUSD'), allowLive: process.env.EXEC_ALLOW_LIVE === 'true' })
  : new StubExecutor()
const rec = await handleSignal(rawBody, { store: redisStore(redis), executor, secret, now: Date.now() })
res.status(200).json({ ok: rec.outcome !== 'REJECTED', outcome: rec.outcome, reason: rec.reason, events: rec.events, mode: gate.enabled ? 'live-demo' : 'stub' })
```
- [ ] **Step 1: Implement** as above.
- [ ] **Step 2: Full gate** `npm run typecheck && npx vitest run && npm run lint && npm run build` → all green.
- [ ] **Step 3: Commit** `feat(executor): webhook selects MetaApi executor when enabled, else stub`

---

## Self-Review
- Real MetaApi execution behind the Executor interface → Tasks 4, 5. ✓
- Demo-only + dormant-by-default gate → Tasks 2, 4, 5. ✓
- Dynamic SDK import (no new dep, build stays green) → Task 4. ✓
- Reversal safety (validate-all-before-execute) + broker logging → Task 3. ✓
- Never throws / no silent failure preserved → Tasks 3, 4. ✓
- `exec:*`, no `src/` imports, NodeNext → all. ✓

**Placeholder scan:** the `>` note on method names is a verification instruction (confirmed against SDK docs). No TBD.

**Type consistency:** `Executor`/`ExecOutcome`/`BrokerOrder` reused from Phase 1; `MarketOrderReq`/`executionGate`/`executeWith`/`MetaApiExecutor` new, consumed by the webhook (Task 5). `symbolFor` reused from `validate.ts`.

## Activation (documented for the user; NOT done here)
To turn Phase 2 on after deploy:
1. `npm install metaapi.cloud-sdk` (added to the deploy) — or add it to `package.json` deps.
2. Create a MetaApi account + token; connect an **MT5 demo** account (login/password/server) → note its account id.
3. In Vercel env: `EXEC_ENABLED=true`, `METAAPI_TOKEN=…`, `METAAPI_ACCOUNT_ID=…`, `EXEC_BROKER_SYMBOL=XAUUSDm` (as needed). Leave `EXEC_ALLOW_LIVE` unset (demo-only).
4. Extend the TradingView alert payload with `entry/sl/tp/lot` (see the spec).

## Notes for the executor
- Do NOT add `metaapi.cloud-sdk` to package.json in this phase — the dynamic import keeps build green without it; the user installs it at activation.
- Final gate: `npm run typecheck && npm run test:run && npm run lint && npm run build`.
