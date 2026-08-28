// executor/validate.ts
import type { BrokerOrder, Signal, SignalEvent } from './types.js'
import { ExecError } from './errors.js'

/** Map TradingView symbol → broker symbol. Configurable via EXEC_BROKER_SYMBOL; default XAUUSDm. */
export function symbolFor(tvSymbol: string): string {
  if (tvSymbol.toUpperCase().startsWith('XAUUSD')) return process.env.EXEC_BROKER_SYMBOL ?? 'XAUUSDm'
  return tvSymbol
}

/** Validate an entry event against its Signal → a BrokerOrder. Throws RISK/SYMBOL/LOT. */
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
