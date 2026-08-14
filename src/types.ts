export type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number }

export type GateStatus = 'pass' | 'fail' | 'wait'

export type GateResult = { id: string; status: GateStatus; detail: string }

export type MarketContext = { m5: Candle[]; m15: Candle[]; h1: Candle[] }

export type Config = {
  instrument: 'XAUUSD'; accountSize: number; riskPct: number; contractSize: number
  ema: { period: number }
  stoch: { k: number; d: number; smooth: number; overbought: number; oversold: number }
  tolerances: { retestBand: number; breakoutBufferPips: number; consolidationLookback: number }
  minRR: number
}

export type Gate = (ctx: MarketContext, config: Config) => GateResult
