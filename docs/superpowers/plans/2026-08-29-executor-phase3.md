# Executor Bot — Phase 3 Implementation Plan (Reconciliation + safety)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A safety net that detects drift between what the bot *thinks* it holds and what the broker *actually* holds — the auditable "does reality match?" check the handoff (§28 Phase 4, §30) demands. Pure `reconcile()` compares bot `PositionState` vs broker positions; a token-gated `api/executor/reconcile` endpoint fetches broker positions (when enabled), runs it, and logs any drift; the diagnostics view surfaces the reconcile trail. Dormant-safe (no creds → reports disabled).

**Architecture:** Pure `executor/reconcile.ts` (state + broker positions → report). `MetaApiExecutor` gains `listPositions()`. `api/executor/reconcile.ts` wires them, token-gated, and appends to `exec:reconcile`. `Store` grows `appendReconcile` + a `reconcile` recent-kind; `api/executor/logs.ts` includes it.

**Tech Stack:** TypeScript (strict, NodeNext `.js`), Vitest, Vercel serverless, Upstash Redis, MetaApi (dynamic, runtime-only).

## Global Constraints
- Dormant-safe: with the execution gate disabled, `api/executor/reconcile` does NO broker call and returns `{ enabled:false }`.
- `reconcile()` is pure (no I/O/clock). The endpoint is token-gated (same `WEBHOOK_SECRET` token as the logs endpoint).
- Never throws out of the endpoint; broker/connect errors → a logged reconcile record with an error, HTTP 200.
- `exec:*` namespacing; no `src/` imports; NodeNext `.js`. Final gate green (no `metaapi.cloud-sdk` installed).
- Scope: STATE reconciliation (position existence/direction/count). Per-fill slippage comparison (TradingView vs broker levels) needs live deal history — noted as a future enhancement, not built here.

---

### Task 1: Pure `reconcile`

**Files:** Create `executor/reconcile.ts` (+`executor/reconcile.test.ts`).
**Interfaces:**
```ts
export type BrokerPosition = { symbol: string; direction: 'long' | 'short'; volume: number }
export type Drift =
  | { kind: 'bot_has_no_broker_position'; botState: 'LONG' | 'SHORT' }
  | { kind: 'broker_has_unexpected_position'; position: BrokerPosition }
  | { kind: 'direction_mismatch'; botState: 'LONG' | 'SHORT'; position: BrokerPosition }
  | { kind: 'multiple_broker_positions'; count: number }
export type ReconcileReport = { inSync: boolean; botState: PositionState; brokerCount: number; drift: Drift[] }
export function reconcile(botState: PositionState, positions: BrokerPosition[]): ReconcileReport
```
`positions` is already filtered to the traded symbol by the caller.

- [ ] **Step 1: Failing test**
```ts
// executor/reconcile.test.ts
import { describe, expect, it } from 'vitest'
import { reconcile, type BrokerPosition } from './reconcile'

const long: BrokerPosition = { symbol: 'XAUUSDm', direction: 'long', volume: 0.01 }
const short: BrokerPosition = { symbol: 'XAUUSDm', direction: 'short', volume: 0.01 }

describe('reconcile', () => {
  it('FLAT + no positions = in sync', () => expect(reconcile('FLAT', []).inSync).toBe(true))
  it('LONG + one long = in sync', () => expect(reconcile('LONG', [long]).inSync).toBe(true))
  it('LONG + no positions = drift bot_has_no_broker_position', () => {
    const r = reconcile('LONG', [])
    expect(r.inSync).toBe(false); expect(r.drift[0].kind).toBe('bot_has_no_broker_position')
  })
  it('FLAT + a position = drift broker_has_unexpected_position', () => {
    expect(reconcile('FLAT', [long]).drift[0].kind).toBe('broker_has_unexpected_position')
  })
  it('LONG + a short = direction_mismatch', () => {
    expect(reconcile('LONG', [short]).drift.some((d) => d.kind === 'direction_mismatch')).toBe(true)
  })
  it('any state + 2 positions = multiple_broker_positions', () => {
    expect(reconcile('LONG', [long, long]).drift.some((d) => d.kind === 'multiple_broker_positions')).toBe(true)
  })
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
```ts
// executor/reconcile.ts
import type { PositionState } from './types.js'
export type BrokerPosition = { symbol: string; direction: 'long' | 'short'; volume: number }
export type Drift =
  | { kind: 'bot_has_no_broker_position'; botState: 'LONG' | 'SHORT' }
  | { kind: 'broker_has_unexpected_position'; position: BrokerPosition }
  | { kind: 'direction_mismatch'; botState: 'LONG' | 'SHORT'; position: BrokerPosition }
  | { kind: 'multiple_broker_positions'; count: number }
export type ReconcileReport = { inSync: boolean; botState: PositionState; brokerCount: number; drift: Drift[] }

export function reconcile(botState: PositionState, positions: BrokerPosition[]): ReconcileReport {
  const drift: Drift[] = []
  if (positions.length > 1) drift.push({ kind: 'multiple_broker_positions', count: positions.length })

  if (botState === 'FLAT') {
    for (const p of positions) drift.push({ kind: 'broker_has_unexpected_position', position: p })
  } else {
    const want: 'long' | 'short' = botState === 'LONG' ? 'long' : 'short'
    if (positions.length === 0) {
      drift.push({ kind: 'bot_has_no_broker_position', botState })
    } else {
      for (const p of positions) {
        if (p.direction !== want) drift.push({ kind: 'direction_mismatch', botState, position: p })
      }
    }
  }
  return { inSync: drift.length === 0, botState, brokerCount: positions.length, drift }
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(executor): pure state/broker reconciliation`

---

### Task 2: `listPositions()` on MetaApiExecutor + Store.appendReconcile

**Files:** Modify `executor/metaapi.ts`, `executor/ports.ts`, `executor/logs.ts`; extend `executor/logs.test.ts` if needed.
**Interfaces:**
- `MetaApiExecutor.listPositions(): Promise<BrokerPosition[]>` — connect, `conn.getPositions()`, filter to `cfg.symbol`, map `type` → direction. Never throws (errors → `[]` is unsafe for reconcile; instead throw an `ExecError('BROKER',…)` that the endpoint catches and logs — do NOT silently return []).
- `Store.appendReconcile(rec: unknown): Promise<void>` + add `'reconcile'` to `recent`'s kind union and the key map (`exec:reconcile`).

- [ ] **Step 1: Extend the `RpcConnection` type** in `metaapi.ts` with `getPositions(): Promise<Array<{ symbol: string; type: string; volume: number }>>`. Add:
```ts
async listPositions(): Promise<import('./reconcile.js').BrokerPosition[]> {
  const conn = await this.connection()
  const raw = await conn.getPositions()
  return raw
    .filter((p) => p.symbol === this.cfg.symbol)
    .map((p) => ({ symbol: p.symbol, direction: /BUY/i.test(p.type) ? 'long' as const : 'short' as const, volume: p.volume }))
}
```
(Let connect/broker errors propagate; the endpoint catches them.)
- [ ] **Step 2: Store** — in `ports.ts` add `appendReconcile(rec: unknown): Promise<void>` and widen `recent`'s kind to `'raw' | 'acceptance' | 'broker' | 'reconcile'`. In `logs.ts` add `reconcile: 'exec:reconcile'` to `K`, implement `appendReconcile: (rec) => push(K.reconcile, rec)`, and include `reconcile` in `recent`'s key lookup. Update any in-memory fake Stores in tests to add `appendReconcile: async () => {}`.
- [ ] **Step 3: Run** `npx vitest run executor/` → all green (fakes updated).
- [ ] **Step 4: Commit** `feat(executor): broker listPositions + reconcile log store`

---

### Task 3: `api/executor/reconcile.ts` (token-gated) + diagnostics

**Files:** Create `api/executor/reconcile.ts`; modify `api/executor/logs.ts` to include the reconcile list.

- [ ] **Step 1: `api/executor/reconcile.ts`**
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { redisStore } from '../../executor/logs.js'
import { executionGate } from '../../executor/gate.js'
import { MetaApiExecutor } from '../../executor/metaapi.js'
import { reconcile } from '../../executor/reconcile.js'
import { symbolFor } from '../../executor/validate.js'

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}
function tokenOk(req: VercelRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET
  const t = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token
  return Boolean(secret) && typeof t === 'string' && t.length === secret!.length && t === secret
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!process.env.WEBHOOK_SECRET) { res.status(500).json({ ok: false, error: 'server missing WEBHOOK_SECRET' }); return }
  if (!tokenOk(req)) { res.status(401).json({ ok: false, error: 'unauthorized' }); return }
  const redis = getRedis()
  if (!redis) { res.status(500).json({ ok: false, error: 'server missing Redis' }); return }
  const store = redisStore(redis)
  const gate = executionGate(process.env)
  if (!gate.enabled) { res.status(200).json({ ok: true, enabled: false, reason: gate.reason }); return }
  try {
    const executor = new MetaApiExecutor({ token: process.env.METAAPI_TOKEN!, accountId: process.env.METAAPI_ACCOUNT_ID!, symbol: symbolFor('XAUUSD'), allowLive: process.env.EXEC_ALLOW_LIVE === 'true' })
    const positions = await executor.listPositions()
    const report = reconcile(await store.getState(), positions)
    await store.appendReconcile({ at: Date.now(), ...report })
    res.status(200).json({ ok: true, enabled: true, report })
  } catch (err) {
    const rec = { at: Date.now(), error: err instanceof Error ? err.message : 'reconcile failed' }
    await store.appendReconcile(rec)
    res.status(200).json({ ok: false, enabled: true, ...rec })
  }
}
```
- [ ] **Step 2: `api/executor/logs.ts`** — add `reconcile: await store.recent('reconcile', 25)` to the response JSON (keep the existing token gate).
- [ ] **Step 3: Full gate** `npm run typecheck && npx vitest run && npm run lint && npm run build` → green.
- [ ] **Step 4: Commit** `feat(executor): token-gated reconcile endpoint + diagnostics`

---

## Self-Review
- Pure reconciliation (state vs broker) → Task 1. ✓
- Broker position fetch (dormant-safe, errors surfaced not swallowed) → Task 2. ✓
- Token-gated reconcile endpoint + drift logging + diagnostics → Task 3. ✓
- Dormant-safe (gate disabled → no broker call) → Task 3. ✓
- `exec:*`, no `src/`, NodeNext, build green w/o SDK → all. ✓

**Placeholder scan:** none.
**Type consistency:** `BrokerPosition`/`ReconcileReport` (Task 1) consumed by `listPositions` (Task 2) + the endpoint (Task 3). `Store.appendReconcile`/`recent('reconcile')` (Task 2) used by the endpoint + logs (Task 3). `executionGate`/`MetaApiExecutor`/`symbolFor` reused.

## Activation (documented; not done here)
- Once Phase 2 is live, hit `GET /api/executor/reconcile?token=<WEBHOOK_SECRET>` (manually or via a cron, e.g. a GitHub Action like `sim-tick.yml`) to log drift. `GET /api/executor/logs?token=…` shows the reconcile trail alongside raw/acceptance/broker — the full auditable cycle.
- Future enhancement (not built): per-fill slippage comparison (TradingView payload levels vs broker deal fills) via `getDealsByTimeRange`.

## Notes for the executor
- Final gate: `npm run typecheck && npm run test:run && npm run lint && npm run build` (no `metaapi.cloud-sdk` installed).
