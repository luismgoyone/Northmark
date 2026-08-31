// executor/validate.ts
import type { BrokerOrder, Signal, SignalEvent } from './types.js'
import { ExecError } from './errors.js'

/** Map TradingView symbol → broker symbol. Configurable via EXEC_BROKER_SYMBOL; default XAUUSDm. */
export function symbolFor(tvSymbol: string): string {
  if (tvSymbol.toUpperCase().startsWith('XAUUSD')) return process.env.EXEC_BROKER_SYMBOL ?? 'XAUUSDm'
  return tvSymbol
}

/**
 * Hard ceiling on order size, in broker lots. A safety net so a bad payload can never
 * size a large order — the intended forward-test size is 0.01. Configurable via
 * EXEC_MAX_LOT; default 0.10 (10× headroom). Falls back to 0.10 on any invalid value.
 */
export function maxLot(): number {
  const raw = Number.parseFloat(process.env.EXEC_MAX_LOT ?? '')
  return Number.isFinite(raw) && raw > 0 ? raw : 0.1
}

/** Validate an entry event against its Signal → a BrokerOrder. Throws RISK/SYMBOL/LOT. */
export function validateEntry(event: SignalEvent, s: Signal): BrokerOrder {
  if (s.entry === undefined || s.sl === undefined || s.tp === undefined) {
    throw new ExecError('RISK', 'entry/sl/tp required for an entry order')
  }
  if (s.lot === undefined || !(s.lot > 0) || !Number.isFinite(s.lot)) {
    throw new ExecError('LOT', `invalid lot: ${s.lot}`)
  }
  const cap = maxLot()
  if (s.lot > cap) throw new ExecError('LOT', `lot ${s.lot} exceeds the hard cap of ${cap} (set EXEC_MAX_LOT to change)`)
  const long = event.direction === 'long'
  const ok = long ? s.sl < s.entry && s.entry < s.tp : s.tp < s.entry && s.entry < s.sl
  if (!ok) throw new ExecError('RISK', `SL/TP on the wrong side for a ${event.direction}: entry ${s.entry}, sl ${s.sl}, tp ${s.tp}`)
  const symbol = symbolFor(s.symbol)
  if (!symbol) throw new ExecError('SYMBOL', `no broker symbol for ${s.symbol}`)
  return { symbol, direction: event.direction, entry: s.entry, sl: s.sl, tp: s.tp, lot: s.lot }
}
