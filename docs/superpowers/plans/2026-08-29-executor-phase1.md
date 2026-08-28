# Executor Bot — Phase 1 Implementation Plan (Reception + Diagnostics, no broker)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A fully-logged webhook pipeline that receives TradingView V2.7.1 alerts and runs them through auth → raw-log → parse → classify → dedupe → position state machine → validate → **stub executor** → acceptance log, with a read-only diagnostics view. Proves signal detection end-to-end with **zero broker risk**.

**Architecture:** Pure modules under `executor/` (schema, errors, parse, classify, state, validate, dedupe-core, pipeline) with I/O isolated behind a `Store` interface (Upstash Redis impl) and an `Executor` interface (Phase-1 stub). Two Vercel routes: `api/executor/webhook.ts` (the pipeline) and `api/executor/logs.ts` (diagnostics). Namespaced `exec:*` in Redis so it never collides with Northmark's `sim:*`.

**Tech Stack:** TypeScript (strict, NodeNext `.js` imports), Vitest, Vercel serverless, Upstash Redis.

## Global Constraints
- **No broker calls in Phase 1.** The executor is a stub that records "would execute" — nothing leaves the process to any broker.
- **No silent failures:** every signal produces an acceptance record with an explicit outcome + reason. Every rejection carries a typed error category.
- **Demo-only / safety posture** carries forward: even the stub records are marked `mode: 'stub'`.
- Pure modules (`schema/errors/parse/classify/state/validate/dedupe`): no I/O, no clock, no randomness — `now`/ids passed in. I/O only in `logs.ts` (Redis) + the `api/executor/*` handlers.
- Import direction: `api/executor/* → executor/* → (types)`. No imports from Northmark's `src/` (fully separate subsystem). NodeNext `.js` suffixes.
- Redis keys namespaced `exec:*`. Never touch `sim:*`.
- Error taxonomy (verbatim): `SIGNAL | DATA | STRATEGY | POSITION | RISK | SYMBOL | LOT | BROKER | DUPLICATE`.
- Classification is **transition-based** (marketPosition/prevMarketPosition), not action-based, so it's robust to TradingView's `strategy.order.action` semantics.
- Final gate: `npm run typecheck && npm run test:run && npm run lint && npm run build` all green.

---

### Task 1: Types + error taxonomy

**Files:** Create `executor/types.ts`, `executor/errors.ts`; Test `executor/errors.test.ts`.

**Interfaces (produced):**
```ts
// executor/types.ts
export type Action = 'buy' | 'sell'
export type MarketPosition = 'long' | 'short' | 'flat'
export type Signal = {
  secret?: string
  eventId: string
  timestamp: string
  symbol: string
  action: Action | null
  marketPosition: MarketPosition
  prevMarketPosition: MarketPosition
  entry?: number
  sl?: number
  tp?: number
  lot?: number
  setupStrength?: string
}
export type SignalEventType = 'LONG_ENTRY' | 'SHORT_ENTRY' | 'LONG_EXIT' | 'SHORT_EXIT'
export type SignalEvent = { type: SignalEventType; direction: 'long' | 'short'; isEntry: boolean }
export type PositionState = 'FLAT' | 'LONG' | 'SHORT'
```

- [ ] **Step 1: Write the failing test**
```ts
// executor/errors.test.ts
import { describe, expect, it } from 'vitest'
import { ExecError, CATEGORIES } from './errors'

describe('ExecError', () => {
  it('carries a category from the fixed taxonomy and a message', () => {
    const e = new ExecError('DUPLICATE', 'event abc already processed')
    expect(e.category).toBe('DUPLICATE')
    expect(e.message).toMatch(/already processed/)
    expect(CATEGORIES).toContain('BROKER')
    expect(CATEGORIES).toHaveLength(9)
  })
})
```
- [ ] **Step 2: Run** `npx vitest run executor/errors.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
// executor/errors.ts
export const CATEGORIES = ['SIGNAL', 'DATA', 'STRATEGY', 'POSITION', 'RISK', 'SYMBOL', 'LOT', 'BROKER', 'DUPLICATE'] as const
export type ErrorCategory = (typeof CATEGORIES)[number]

/** A classified, non-silent failure. category ∈ the fixed taxonomy. */
export class ExecError extends Error {
  readonly category: ErrorCategory
  constructor(category: ErrorCategory, message: string) {
    super(message)
    this.name = 'ExecError'
    this.category = category
  }
}
```
Also create `executor/types.ts` with the types block above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git add executor/types.ts executor/errors.ts executor/errors.test.ts && git commit -m "feat(executor): types + error taxonomy"`

---

### Task 2: Parse

**Files:** Create `executor/parse.ts`; Test `executor/parse.test.ts`.
**Interfaces:** `parseSignal(raw: unknown): Signal` — throws `ExecError('DATA', …)` on malformed input. Numbers may arrive as strings (TradingView sends strings) → coerce; missing optional numerics stay `undefined`.

- [ ] **Step 1: Failing test**
```ts
// executor/parse.test.ts
import { describe, expect, it } from 'vitest'
import { parseSignal } from './parse'
import { ExecError } from './errors'

const base = {
  event_id: 'e1', timestamp: '2026-08-29T00:00:00Z', symbol: 'XAUUSD',
  action: 'sell', market_position: 'short', prev_market_position: 'flat',
  entry: '4600.5', sl: '4602.0', tp: '4598.1', lot: '0.01', setup_strength: 'strong', secret: 's',
}

describe('parseSignal', () => {
  it('coerces string numerics and maps snake_case → typed Signal', () => {
    const s = parseSignal(base)
    expect(s).toMatchObject({ eventId: 'e1', symbol: 'XAUUSD', action: 'sell', marketPosition: 'short', prevMarketPosition: 'flat', entry: 4600.5, sl: 4602, tp: 4598.1, lot: 0.01 })
  })
  it('tolerates missing sl/tp/lot (Phase-1 pre-Pine-change)', () => {
    const { entry: _e, sl: _s, tp: _t, lot: _l, ...rest } = base
    expect(parseSignal(rest).sl).toBeUndefined()
  })
  it('throws DATA on non-object', () => {
    expect(() => parseSignal('nope')).toThrow(ExecError)
  })
  it('throws DATA when required fields are absent', () => {
    expect(() => parseSignal({ symbol: 'XAUUSD' })).toThrow(/market_position|event_id/)
  })
  it('rejects an unknown marketPosition', () => {
    expect(() => parseSignal({ ...base, market_position: 'sideways' })).toThrow(ExecError)
  })
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
```ts
// executor/parse.ts
import type { Action, MarketPosition, Signal } from './types.js'
import { ExecError } from './errors.js'

const MPS: MarketPosition[] = ['long', 'short', 'flat']

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k]
  if (typeof v !== 'string' || v === '') throw new ExecError('DATA', `missing/invalid field: ${k}`)
  return v
}
function mp(o: Record<string, unknown>, k: string): MarketPosition {
  const v = str(o, k).toLowerCase()
  if (!MPS.includes(v as MarketPosition)) throw new ExecError('DATA', `invalid ${k}: ${v}`)
  return v as MarketPosition
}

/** Raw webhook body → typed Signal. Coerces string numerics. Throws ExecError('DATA') on malformed input. */
export function parseSignal(raw: unknown): Signal {
  if (typeof raw !== 'object' || raw === null) throw new ExecError('DATA', 'body is not a JSON object')
  const o = raw as Record<string, unknown>
  const actionRaw = typeof o.action === 'string' ? o.action.toLowerCase() : null
  const action: Action | null = actionRaw === 'buy' || actionRaw === 'sell' ? actionRaw : null
  return {
    secret: typeof o.secret === 'string' ? o.secret : undefined,
    eventId: str(o, 'event_id'),
    timestamp: str(o, 'timestamp'),
    symbol: str(o, 'symbol'),
    action,
    marketPosition: mp(o, 'market_position'),
    prevMarketPosition: mp(o, 'prev_market_position'),
    entry: num(o.entry),
    sl: num(o.sl),
    tp: num(o.tp),
    lot: num(o.lot),
    setupStrength: typeof o.setup_strength === 'string' ? o.setup_strength : undefined,
  }
}
```
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(executor): parse raw webhook body into a typed Signal`

---

### Task 3: Classify (transition-based)

**Files:** Create `executor/classify.ts`; Test `executor/classify.test.ts`.
**Interfaces:** `classify(signal: Signal): SignalEvent[]` — returns one event, or `[EXIT, ENTRY]` for a reversal; throws `ExecError('SIGNAL', …)` on a no-op/ambiguous transition.

- [ ] **Step 1: Failing test**
```ts
// executor/classify.test.ts
import { describe, expect, it } from 'vitest'
import { classify } from './classify'
import { ExecError } from './errors'
import type { Signal } from './types'

const sig = (prev: string, cur: string): Signal => ({
  eventId: 'e', timestamp: 't', symbol: 'XAUUSD', action: null,
  marketPosition: cur as Signal['marketPosition'], prevMarketPosition: prev as Signal['prevMarketPosition'],
})

describe('classify', () => {
  it('flat→long = LONG_ENTRY', () => expect(classify(sig('flat', 'long'))).toEqual([{ type: 'LONG_ENTRY', direction: 'long', isEntry: true }]))
  it('flat→short = SHORT_ENTRY', () => expect(classify(sig('flat', 'short'))[0].type).toBe('SHORT_ENTRY'))
  it('long→flat = LONG_EXIT', () => expect(classify(sig('long', 'flat'))[0].type).toBe('LONG_EXIT'))
  it('short→flat = SHORT_EXIT', () => expect(classify(sig('short', 'flat'))[0].type).toBe('SHORT_EXIT'))
  it('long→short = reversal [LONG_EXIT, SHORT_ENTRY]', () => expect(classify(sig('long', 'short')).map((e) => e.type)).toEqual(['LONG_EXIT', 'SHORT_ENTRY']))
  it('short→long = reversal [SHORT_EXIT, LONG_ENTRY]', () => expect(classify(sig('short', 'long')).map((e) => e.type)).toEqual(['SHORT_EXIT', 'LONG_ENTRY']))
  it('same state (long→long) throws SIGNAL', () => expect(() => classify(sig('long', 'long'))).toThrow(ExecError))
  it('flat→flat throws SIGNAL', () => expect(() => classify(sig('flat', 'flat'))).toThrow(ExecError))
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
```ts
// executor/classify.ts
import type { Signal, SignalEvent } from './types.js'
import { ExecError } from './errors.js'

const LONG_ENTRY: SignalEvent = { type: 'LONG_ENTRY', direction: 'long', isEntry: true }
const SHORT_ENTRY: SignalEvent = { type: 'SHORT_ENTRY', direction: 'short', isEntry: true }
const LONG_EXIT: SignalEvent = { type: 'LONG_EXIT', direction: 'long', isEntry: false }
const SHORT_EXIT: SignalEvent = { type: 'SHORT_EXIT', direction: 'short', isEntry: false }

/** Classify by the marketPosition transition. Reversal → [exit, entry]. Throws SIGNAL on no-op/ambiguous. */
export function classify(s: Signal): SignalEvent[] {
  const key = `${s.prevMarketPosition}->${s.marketPosition}`
  switch (key) {
    case 'flat->long': return [LONG_ENTRY]
    case 'flat->short': return [SHORT_ENTRY]
    case 'long->flat': return [LONG_EXIT]
    case 'short->flat': return [SHORT_EXIT]
    case 'long->short': return [LONG_EXIT, SHORT_ENTRY]
    case 'short->long': return [SHORT_EXIT, LONG_ENTRY]
    default:
      throw new ExecError('SIGNAL', `ambiguous/no-op transition: ${key}`)
  }
}
```
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(executor): transition-based signal classification`

---

### Task 4: Position state machine

**Files:** Create `executor/state.ts`; Test `executor/state.test.ts`.
**Interfaces:** `applyEvent(state: PositionState, event: SignalEvent): PositionState` — throws `ExecError('POSITION', …)` on an illegal transition (pyramiding, exit with no position, wrong-direction exit).

- [ ] **Step 1: Failing test**
```ts
// executor/state.test.ts
import { describe, expect, it } from 'vitest'
import { applyEvent } from './state'
import { ExecError } from './errors'
import type { SignalEvent } from './types'

const E = {
  LE: { type: 'LONG_ENTRY', direction: 'long', isEntry: true } as SignalEvent,
  SE: { type: 'SHORT_ENTRY', direction: 'short', isEntry: true } as SignalEvent,
  LX: { type: 'LONG_EXIT', direction: 'long', isEntry: false } as SignalEvent,
  SX: { type: 'SHORT_EXIT', direction: 'short', isEntry: false } as SignalEvent,
}
describe('applyEvent', () => {
  it('FLAT + LONG_ENTRY → LONG', () => expect(applyEvent('FLAT', E.LE)).toBe('LONG'))
  it('FLAT + SHORT_ENTRY → SHORT', () => expect(applyEvent('FLAT', E.SE)).toBe('SHORT'))
  it('LONG + LONG_EXIT → FLAT', () => expect(applyEvent('LONG', E.LX)).toBe('FLAT'))
  it('SHORT + SHORT_EXIT → FLAT', () => expect(applyEvent('SHORT', E.SX)).toBe('FLAT'))
  it('rejects pyramiding: LONG + LONG_ENTRY', () => expect(() => applyEvent('LONG', E.LE)).toThrow(ExecError))
  it('rejects exit with no position: FLAT + LONG_EXIT', () => expect(() => applyEvent('FLAT', E.LX)).toThrow(ExecError))
  it('rejects wrong-direction exit: LONG + SHORT_EXIT', () => expect(() => applyEvent('LONG', E.SX)).toThrow(ExecError))
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
```ts
// executor/state.ts
import type { PositionState, SignalEvent } from './types.js'
import { ExecError } from './errors.js'

/** Advance the FLAT/LONG/SHORT machine. No pyramiding; exits must match the open direction. */
export function applyEvent(state: PositionState, event: SignalEvent): PositionState {
  if (event.isEntry) {
    if (state !== 'FLAT') throw new ExecError('POSITION', `cannot open ${event.direction}: already ${state} (no pyramiding)`)
    return event.direction === 'long' ? 'LONG' : 'SHORT'
  }
  // exit
  const need: PositionState = event.direction === 'long' ? 'LONG' : 'SHORT'
  if (state !== need) throw new ExecError('POSITION', `cannot ${event.type}: position is ${state}`)
  return 'FLAT'
}
```
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(executor): position state machine`

---

### Task 5: Validate (SL/TP, symbol, lot)

**Files:** Create `executor/validate.ts`; Test `executor/validate.test.ts`.
**Interfaces:**
```ts
export type BrokerOrder = { symbol: string; direction: 'long' | 'short'; entry: number; sl: number; tp: number; lot: number }
export function symbolFor(tvSymbol: string): string   // XAUUSD → configured broker symbol (default XAUUSDm)
export function validateEntry(event: SignalEvent, s: Signal): BrokerOrder  // throws RISK/SYMBOL/LOT
```
For an entry: require `entry/sl/tp/lot` present; long → `sl < entry < tp`; short → `tp < entry < sl`; `lot > 0`. Exits need no order (handled by pipeline).

- [ ] **Step 1: Failing test**
```ts
// executor/validate.test.ts
import { describe, expect, it } from 'vitest'
import { validateEntry, symbolFor } from './validate'
import { ExecError } from './errors'
import type { Signal, SignalEvent } from './types'

const LE: SignalEvent = { type: 'LONG_ENTRY', direction: 'long', isEntry: true }
const SE: SignalEvent = { type: 'SHORT_ENTRY', direction: 'short', isEntry: true }
const s = (o: Partial<Signal>): Signal => ({ eventId: 'e', timestamp: 't', symbol: 'XAUUSD', action: null, marketPosition: 'flat', prevMarketPosition: 'flat', ...o })

describe('validateEntry', () => {
  it('accepts a well-formed long (sl<entry<tp) and maps the symbol', () => {
    const o = validateEntry(LE, s({ entry: 100, sl: 99, tp: 101.2, lot: 0.01 }))
    expect(o).toEqual({ symbol: symbolFor('XAUUSD'), direction: 'long', entry: 100, sl: 99, tp: 101.2, lot: 0.01 })
  })
  it('accepts a well-formed short (tp<entry<sl)', () => {
    expect(validateEntry(SE, s({ entry: 100, sl: 101, tp: 98.8, lot: 0.01 })).direction).toBe('short')
  })
  it('throws RISK when SL/TP are missing', () => expect(() => validateEntry(LE, s({ entry: 100, lot: 0.01 }))).toThrow(/RISK|sl|tp/i))
  it('throws RISK on wrong-side SL for a long', () => expect(() => validateEntry(LE, s({ entry: 100, sl: 101, tp: 102, lot: 0.01 }))).toThrow(ExecError))
  it('throws LOT on non-positive lot', () => expect(() => validateEntry(LE, s({ entry: 100, sl: 99, tp: 101, lot: 0 }))).toThrow(ExecError))
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
```ts
// executor/validate.ts
import type { BrokerOrder } from './types.js' // add BrokerOrder to types.ts (see note)
import type { Signal, SignalEvent } from './types.js'
import { ExecError } from './errors.js'

/** Map TradingView symbol → broker symbol. Configurable via EXEC_BROKER_SYMBOL; default XAUUSDm. */
export function symbolFor(tvSymbol: string): string {
  if (tvSymbol.toUpperCase().startsWith('XAUUSD')) return process.env.EXEC_BROKER_SYMBOL ?? 'XAUUSDm'
  return tvSymbol
}

export function validateEntry(event: SignalEvent, s: Signal): BrokerOrder {
  if (s.entry === undefined || s.sl === undefined || s.tp === undefined) {
    throw new ExecError('RISK', 'entry/sl/tp required for an entry order')
  }
  if (s.lot === undefined || !(s.lot > 0)) throw new ExecError('LOT', `invalid lot: ${s.lot}`)
  const long = event.direction === 'long'
  const ok = long ? s.sl < s.entry && s.entry < s.tp : s.tp < s.entry && s.entry < s.sl
  if (!ok) throw new ExecError('RISK', `SL/TP on the wrong side for a ${event.direction}: entry ${s.entry}, sl ${s.sl}, tp ${s.tp}`)
  const symbol = symbolFor(s.symbol)
  if (!symbol) throw new ExecError('SYMBOL', `no broker symbol for ${s.symbol}`)
  return { symbol, direction: event.direction, entry: s.entry, sl: s.sl, tp: s.tp, lot: s.lot }
}
```
> Add `export type BrokerOrder = { symbol: string; direction: 'long' | 'short'; entry: number; sl: number; tp: number; lot: number }` to `executor/types.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(executor): entry validation + symbol mapping`

---

### Task 6: Store + Executor interfaces (+ stub) + logs

**Files:** Create `executor/ports.ts` (interfaces), `executor/executor.ts` (stub), `executor/logs.ts` (Redis-backed Store); Test `executor/executor.test.ts`, `executor/logs.test.ts`.

**Interfaces:**
```ts
// executor/ports.ts
export type ExecOutcome = { status: 'stub' | 'sent' | 'error'; detail: string; ticket?: string; fill?: number }
export interface Executor {
  openPosition(order: BrokerOrder, eventId: string): Promise<ExecOutcome>
  closePosition(direction: 'long' | 'short', eventId: string): Promise<ExecOutcome>
}
export interface Store {
  appendRaw(body: string): Promise<void>
  appendAcceptance(rec: AcceptanceRecord): Promise<void>
  appendBroker(rec: unknown): Promise<void>
  getState(): Promise<PositionState>
  setState(s: PositionState): Promise<void>
  seen(eventId: string): Promise<boolean>   // true if already processed; records it if not
  recent(kind: 'raw' | 'acceptance' | 'broker', n: number): Promise<unknown[]>
}
export type AcceptanceRecord = {
  eventId: string; receivedAt: number; symbol: string; events: string[]
  outcome: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE'; reason: string; stateBefore: string; stateAfter: string
}
```

- [ ] **Step 1: Stub executor test**
```ts
// executor/executor.test.ts
import { describe, expect, it } from 'vitest'
import { StubExecutor } from './executor'

describe('StubExecutor', () => {
  it('records would-open without any network', async () => {
    const r = await new StubExecutor().openPosition({ symbol: 'XAUUSDm', direction: 'long', entry: 100, sl: 99, tp: 101, lot: 0.01 }, 'e1')
    expect(r.status).toBe('stub')
    expect(r.detail).toMatch(/would open/i)
  })
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement stub + interfaces**
```ts
// executor/executor.ts
import type { BrokerOrder } from './types.js'
import type { Executor, ExecOutcome } from './ports.js'

/** Phase-1 executor: records intent, never touches a broker. */
export class StubExecutor implements Executor {
  async openPosition(order: BrokerOrder, eventId: string): Promise<ExecOutcome> {
    return { status: 'stub', detail: `would open ${order.direction} ${order.symbol} ${order.lot} @${order.entry} SL${order.sl} TP${order.tp} (${eventId})` }
  }
  async closePosition(direction: 'long' | 'short', eventId: string): Promise<ExecOutcome> {
    return { status: 'stub', detail: `would close ${direction} (${eventId})` }
  }
}
```
Put the interfaces from above in `executor/ports.ts` (import `BrokerOrder`/`PositionState`/`AcceptanceRecord` from types; move `AcceptanceRecord` to `types.ts` if cleaner).
- [ ] **Step 4: Redis Store impl + test (with a fake client)**
```ts
// executor/logs.ts
import type { Redis } from '@upstash/redis'
import type { PositionState } from './types.js'
import type { AcceptanceRecord, Store } from './ports.js'

const K = {
  raw: 'exec:raw', acceptance: 'exec:acceptance', broker: 'exec:broker',
  state: 'exec:position', seen: (id: string) => `exec:seen:${id}`,
}
const CAP = 500
const SEEN_TTL = 60 * 60 * 24 // 24h

export function redisStore(redis: Redis): Store {
  const push = async (key: string, rec: unknown): Promise<void> => {
    await redis.lpush(key, JSON.stringify(rec))
    await redis.ltrim(key, 0, CAP - 1)
  }
  return {
    appendRaw: (body) => push(K.raw, { at: undefined, body }),
    appendAcceptance: (rec) => push(K.acceptance, rec),
    appendBroker: (rec) => push(K.broker, rec),
    getState: async () => ((await redis.get<PositionState>(K.state)) ?? 'FLAT'),
    setState: async (s) => { await redis.set(K.state, s) },
    seen: async (eventId) => {
      // SET NX + EX: returns 'OK' when newly set (not seen), null when it already existed (seen).
      const res = await redis.set(K.seen(eventId), '1', { nx: true, ex: SEEN_TTL })
      return res === null
    },
    recent: async (kind, n) => {
      const arr = await redis.lrange(K[kind], 0, n - 1)
      return arr.map((x) => (typeof x === 'string' ? JSON.parse(x) : x))
    },
  }
}
```
```ts
// executor/logs.test.ts — test seen()/state with an in-memory fake Redis
import { describe, expect, it } from 'vitest'
import { redisStore } from './logs'

function fakeRedis() {
  const m = new Map<string, unknown>(); const lists = new Map<string, string[]>()
  return {
    async set(k: string, v: unknown, opts?: { nx?: boolean }) { if (opts?.nx && m.has(k)) return null; m.set(k, v); return 'OK' },
    async get(k: string) { return m.get(k) ?? null },
    async lpush(k: string, v: string) { const a = lists.get(k) ?? []; a.unshift(v); lists.set(k, a); return a.length },
    async ltrim() { return 'OK' },
    async lrange(k: string, a: number, b: number) { return (lists.get(k) ?? []).slice(a, b + 1) },
  } as unknown as import('@upstash/redis').Redis
}

describe('redisStore', () => {
  it('seen() is false first time, true second (dedupe)', async () => {
    const s = redisStore(fakeRedis())
    expect(await s.seen('e1')).toBe(false)
    // NOTE: same fake instance:
  })
  it('state defaults FLAT and round-trips', async () => {
    const s = redisStore(fakeRedis())
    expect(await s.getState()).toBe('FLAT')
    await s.setState('LONG'); expect(await s.getState()).toBe('LONG')
  })
})
```
> Fix the dedupe test to reuse ONE fake instance across both `seen` calls: create the fake, wrap in `redisStore`, call `seen('e1')` twice, expect `false` then `true`.
- [ ] **Step 5: Run** `npx vitest run executor/executor.test.ts executor/logs.test.ts` → PASS.
- [ ] **Step 6: Commit** `feat(executor): Store/Executor ports, stub executor, Redis-backed logs+dedupe`

---

### Task 7: Pipeline (orchestrator)

**Files:** Create `executor/pipeline.ts`; Test `executor/pipeline.test.ts`.
**Interfaces:**
```ts
export type Deps = { store: Store; executor: Executor; secret: string; now: number }
export async function handleSignal(rawBody: string, deps: Deps): Promise<AcceptanceRecord>
```
Steps, in order: `appendRaw` (always) → auth (parse secret from body; mismatch → REJECTED/`SIGNAL`, do not process) → `parseSignal` → `seen` (duplicate → DUPLICATE, no state change) → `classify` → for each event: `applyEvent` (POSITION errors), and for entries `validateEntry` + `executor.openPosition`; for exits `executor.closePosition`. Persist `setState` after applying events. Build + `appendAcceptance` an `AcceptanceRecord`. Any `ExecError` → REJECTED with its category+message; never throw out of `handleSignal` (return the record).

- [ ] **Step 1: Failing test**
```ts
// executor/pipeline.test.ts
import { describe, expect, it, vi } from 'vitest'
import { handleSignal } from './pipeline'
import { StubExecutor } from './executor'
import type { Store, AcceptanceRecord } from './ports'
import type { PositionState } from './types'

function memStore(): Store & { accepts: AcceptanceRecord[] } {
  let state: PositionState = 'FLAT'; const seen = new Set<string>(); const accepts: AcceptanceRecord[] = []
  return {
    accepts,
    appendRaw: async () => {}, appendBroker: async () => {}, recent: async () => [],
    appendAcceptance: async (r) => { accepts.push(r) },
    getState: async () => state, setState: async (s) => { state = s },
    seen: async (id) => { if (seen.has(id)) return true; seen.add(id); return false },
  }
}
const body = (o: object) => JSON.stringify({ secret: 'S', timestamp: 't', symbol: 'XAUUSD', ...o })
const deps = (store: Store) => ({ store, executor: new StubExecutor(), secret: 'S', now: 1 })

describe('handleSignal', () => {
  it('accepts a valid long entry, opens (stub), advances state to LONG', async () => {
    const store = memStore()
    const rec = await handleSignal(body({ event_id: 'e1', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101.2, lot: 0.01 }), deps(store))
    expect(rec.outcome).toBe('ACCEPTED')
    expect(rec.events).toContain('LONG_ENTRY')
    expect(await store.getState()).toBe('LONG')
  })
  it('rejects a bad secret without processing', async () => {
    const store = memStore()
    const rec = await handleSignal(JSON.stringify({ secret: 'WRONG', event_id: 'e', timestamp: 't', symbol: 'XAUUSD', market_position: 'long', prev_market_position: 'flat' }), deps(store))
    expect(rec.outcome).toBe('REJECTED'); expect(rec.reason).toMatch(/auth|secret/i)
  })
  it('marks a duplicate event_id as DUPLICATE and does not change state', async () => {
    const store = memStore()
    const b = body({ event_id: 'dup', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 })
    await handleSignal(b, deps(store))
    const rec = await handleSignal(b, deps(store))
    expect(rec.outcome).toBe('DUPLICATE')
  })
  it('rejects pyramiding with a POSITION reason', async () => {
    const store = memStore()
    await handleSignal(body({ event_id: 'a', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 }), deps(store))
    const rec = await handleSignal(body({ event_id: 'b', action: 'buy', market_position: 'long', prev_market_position: 'flat', entry: 100, sl: 99, tp: 101, lot: 0.01 }), deps(store))
    expect(rec.outcome).toBe('REJECTED'); expect(rec.reason).toMatch(/POSITION|pyramiding|already/i)
  })
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `handleSignal` per the step order above. Parse the raw body JSON once (for the secret + to pass to `parseSignal`); on JSON.parse failure → REJECTED `DATA`. Apply the events sequentially, threading state; for a reversal both events apply. Wrap the per-signal work in try/catch converting `ExecError` → REJECTED with `err.category + ': ' + err.message`, other errors → REJECTED `STRATEGY`. Always `appendAcceptance` and return the record.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(executor): pipeline orchestrator (auth→parse→dedupe→classify→state→validate→execute→log)`

---

### Task 8: Vercel routes — webhook + diagnostics

**Files:** Create `api/executor/webhook.ts`, `api/executor/logs.ts`. (No unit tests — Vercel handlers; verified by typecheck + build. The pipeline is already unit-tested.)

- [ ] **Step 1: `api/executor/webhook.ts`**
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { redisStore } from '../../executor/logs.js'
import { StubExecutor } from '../../executor/executor.js'
import { handleSignal } from '../../executor/pipeline.js'

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return }
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) { res.status(500).json({ ok: false, error: 'server missing WEBHOOK_SECRET' }); return }
  const redis = getRedis()
  if (!redis) { res.status(500).json({ ok: false, error: 'server missing Redis' }); return }
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
  const rec = await handleSignal(rawBody, { store: redisStore(redis), executor: new StubExecutor(), secret, now: Date.now() })
  // Always 200 so TradingView doesn't retry-storm; the acceptance record carries the real outcome.
  res.status(200).json({ ok: rec.outcome !== 'REJECTED', outcome: rec.outcome, reason: rec.reason, events: rec.events })
}
```
- [ ] **Step 2: `api/executor/logs.ts`** — read-only diagnostics (JSON):
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { redisStore } from '../../executor/logs.js'

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const redis = getRedis()
  if (!redis) { res.status(200).json({ state: 'FLAT', acceptance: [], raw: [], broker: [] }); return }
  const store = redisStore(redis)
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    state: await store.getState(),
    acceptance: await store.recent('acceptance', 25),
    raw: await store.recent('raw', 25),
    broker: await store.recent('broker', 25),
  })
}
```
- [ ] **Step 3: Verify** `npm run typecheck && npm run build`. Ensure `api/executor/*` compiles under the existing Vercel/tsconfig setup (mirror `api/sim-state.ts`'s import style + the `@vercel/node` types).
- [ ] **Step 4: Full gate** `npm run typecheck && npm run test:run && npm run lint && npm run build` → all green.
- [ ] **Step 5: Commit** `feat(executor): webhook + diagnostics Vercel routes (stub executor)`

---

## Self-Review
- Auth, raw-log-first, parse, classify, dedupe, state machine, validate, stub-execute, acceptance-log → Tasks 1–8. ✓
- No broker calls (StubExecutor) → Tasks 6, 8. ✓
- Error taxonomy + no silent failures (every path → AcceptanceRecord with reason) → Tasks 1, 7. ✓
- Transition-based classification incl. reversal → Task 3. ✓
- `exec:*` namespacing, no `src/` import → Tasks 6, 8. ✓
- Diagnostics view → Task 8. ✓

**Placeholder scan:** the `>` notes are fix-instructions (reuse one fake-redis instance in the dedupe test; add `BrokerOrder` to types; mirror `api/sim-state.ts`) — not TODOs. No TBD.

**Type consistency:** `Signal`/`SignalEvent`/`PositionState`/`BrokerOrder`/`AcceptanceRecord`/`ExecOutcome`/`Store`/`Executor` defined once (Tasks 1, 5, 6) and consumed consistently in classify/state/validate/pipeline/handlers.

## Notes for the executor
- After merge, Phase 1 needs `WEBHOOK_SECRET` + Redis env in Vercel to run live; the diagnostics endpoint degrades to empty without Redis.
- To test end-to-end after deploy: `POST /api/executor/webhook` with a sample payload → then `GET /api/executor/logs` shows the acceptance trail.
- Final gate: `npm run typecheck && npm run test:run && npm run lint && npm run build`.
