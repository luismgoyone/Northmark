import type { Candle, Config, Direction, MarketContext } from '../types.js'
import { evaluateSetup } from './evaluateSetup.js'
import { atr } from '../indicators/atr.js'
import { stochastic } from '../indicators/stochastic.js'
import { swingPoints } from '../indicators/swingPoints.js'
import { ema } from '../indicators/ema.js'
import { classifySession, isFridayLate, type SessionWindow } from '../edge/session.js'
import { newsBlackout, type NewsEvent } from '../edge/newsWindow.js'
import { scoreSetup, type EdgeScore, type EdgeInputs } from '../edge/scoreSetup.js'

export type EdgeSetup = { entry: number; sl: number; tp1: number; tp2: number; lot: number }
export type EdgeVerdict = {
  status: 'wait' | 'blocked' | 'graded'
  direction: Direction | null
  blockedBy?: string
  session: SessionWindow
  news: NewsEvent | null
  score: EdgeScore | null
  setup: EdgeSetup | null
  tradeable: boolean
}

const ATR_PERIOD = 14

/** Nearest OPPOSING swing level beyond `entry` (mirror of evaluateSetup's private helper). */
function opposingLevel(candles: Candle[], direction: Direction, entry: number): number | undefined {
  const { highs, lows } = swingPoints(candles)
  if (direction === 'long') {
    const above = highs.map((i) => candles[i]!.high).filter((h) => h > entry)
    return above.length ? Math.min(...above) : undefined
  }
  const below = lows.map((i) => candles[i]!.low).filter((l) => l < entry)
  return below.length ? Math.max(...below) : undefined
}

/** Build the weighted-score inputs from an authorized base setup + market context. */
function buildInputs(
  ctx: MarketContext,
  config: Config,
  direction: Direction,
  setup: EdgeSetup,
  sessionQuality: EdgeInputs['sessionQuality'],
): EdgeInputs {
  const m5 = ctx.m5
  const isLong = direction === 'long'
  const a = m5.length > ATR_PERIOD ? atr(m5, ATR_PERIOD) : Math.abs(setup.entry - setup.sl)

  // Bias section
  const m15Ema = ema(ctx.m15, config.ema.period).value
  const priceCorrectSideEma = isLong ? setup.entry >= m15Ema : setup.entry <= m15Ema
  const m15Struct = ema(ctx.m15, config.ema.period).slope
  const biasStructureAgrees = isLong ? m15Struct === 'rising' : m15Struct === 'falling'
  const opposing = opposingLevel(m5, direction, setup.entry)
  const noOpposingLevelWithinAtr = opposing === undefined || Math.abs(opposing - setup.entry) > a

  // Structure section — base pipeline guarantees the retest held to reach 'setup'.
  const retestHeld = true
  const risk = Math.abs(setup.entry - setup.sl)
  const entryNotExtended = risk <= 1.5 * a

  // Confluence section
  const st = stochastic(m5, config.stoch.k, config.stoch.d, config.stoch.smooth)
  const stochNotExhausted = isLong ? st.zone !== 'overbought' : st.zone !== 'oversold'
  const aLong = m5.length > 50 ? atr(m5, 50) : a
  const atrHealthy = a >= 0.5 * aLong && a <= 2 * aLong
  const emaAligned = priceCorrectSideEma
  const nearRound = Math.abs(setup.sl - Math.round(setup.sl)) <= 0.2
  const confluenceCount = (emaAligned ? 1 : 0) + (nearRound ? 1 : 0) + (retestHeld ? 1 : 0)

  // Risk section
  const reward = Math.abs(setup.tp2 - setup.entry)
  const rr = risk > 0 ? reward / risk : 0
  const targetBeforeOpposing =
    opposing === undefined || (isLong ? setup.tp2 <= opposing + 1e-9 : setup.tp2 >= opposing - 1e-9)

  return {
    biasStructureAgrees,
    priceCorrectSideEma,
    noOpposingLevelWithinAtr,
    retestHeld,
    entryNotExtended,
    stochNotExhausted,
    atrHealthy,
    confluenceCount,
    sessionQuality,
    rr,
    targetBeforeOpposing,
  }
}

/**
 * The "Claude" engine. Reuses the existing structural pipeline (evaluateSetup) to detect a
 * candidate setup, then layers Claude's own criteria: session-timing veto, news-blackout veto,
 * and the two-stage weighted grade. `tradeable` is true only at grade A/B with no veto.
 * Pure: `now` and `events` are passed in (no clock, no I/O).
 */
export function evaluateSetupClaude(
  ctx: MarketContext,
  config: Config,
  now: number,
  events: NewsEvent[],
): EdgeVerdict {
  const session = classifySession(now)
  const news = newsBlackout(events, now)
  const base = evaluateSetup(ctx, config)

  if (base.status !== 'setup') {
    return {
      status: 'wait',
      direction: base.direction,
      blockedBy: base.blockedBy,
      session,
      news,
      score: null,
      setup: null,
      tradeable: false,
    }
  }

  const direction = base.direction
  const setup: EdgeSetup = { entry: base.entry, sl: base.sl, tp1: base.tp1, tp2: base.tp2, lot: base.lot }
  const score = scoreSetup(buildInputs(ctx, config, direction, setup, session.quality))

  const sessionVeto = session.quality === 'avoid' || isFridayLate(now)
  if (news || sessionVeto) {
    return {
      status: 'blocked',
      direction,
      blockedBy: news ? 'news' : 'session',
      session,
      news,
      score,
      setup,
      tradeable: false,
    }
  }

  return {
    status: 'graded',
    direction,
    session,
    news,
    score,
    setup,
    tradeable: score.grade === 'A' || score.grade === 'B',
  }
}
