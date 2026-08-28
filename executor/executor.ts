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
