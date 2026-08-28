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
