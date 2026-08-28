// executor/metaapi.ts
import type { BrokerOrder } from './types.js'
import type { Executor, ExecOutcome } from './ports.js'
import { buildMarketOrder } from './orderParams.js'

// Minimal shape of the MetaApi RPC connection we use (avoids a static dep on the SDK types).
type RpcConnection = {
  createMarketBuyOrder(symbol: string, volume: number, sl: number, tp: number, options?: unknown): Promise<{ orderId?: string; stringCode?: string }>
  createMarketSellOrder(symbol: string, volume: number, sl: number, tp: number, options?: unknown): Promise<{ orderId?: string; stringCode?: string }>
  closePositionsBySymbol(symbol: string): Promise<{ orderId?: string; stringCode?: string }>
  getPositions(): Promise<Array<{ symbol: string; type: string; volume: number }>>
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

type MetaAccount = {
  server?: string
  waitConnected(): Promise<void>
  getRPCConnection(): { connect(): Promise<void>; waitSynchronized(): Promise<void> } & RpcConnection
}

/** Real executor: lazily connects (cached) to MetaApi MT5 demo and mirrors orders. Demo-gated. */
export class MetaApiExecutor implements Executor {
  private conn: RpcConnection | null = null
  constructor(private cfg: { token: string; accountId: string; symbol: string; allowLive: boolean }) {}

  private async connection(): Promise<RpcConnection> {
    if (this.conn) return this.conn
    // Dynamic import so the SDK is only loaded when execution is actually enabled.
    // The specifier is a runtime variable (not a string literal) so neither tsc nor the
    // bundler resolves it statically — the package is never a build-time dependency.
    const specifier = 'metaapi.cloud-sdk'
    const mod = (await import(/* @vite-ignore */ specifier)) as unknown as { default: new (t: string) => { metatraderAccountApi: { getAccount(id: string): Promise<MetaAccount> } } }
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

  // Fetch open broker positions for the traded symbol. Lets connect/broker errors propagate
  // (do NOT swallow → []): the reconcile endpoint catches and logs them so drift isn't masked.
  async listPositions(): Promise<import('./reconcile.js').BrokerPosition[]> {
    const conn = await this.connection()
    const raw = await conn.getPositions()
    return raw
      .filter((p) => p.symbol === this.cfg.symbol)
      .map((p) => ({ symbol: p.symbol, direction: /BUY/i.test(p.type) ? 'long' as const : 'short' as const, volume: p.volume }))
  }
}
