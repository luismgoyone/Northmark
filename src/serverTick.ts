import type { Candle, Config, MarketContext } from './types.js'
import type { SimConfig, SimState } from './sim/types.js'
import { initialSimState } from './sim/engine.js'
import { evaluateSetup } from './scoring/evaluateSetup.js'
import { evaluateSetupClaude } from './scoring/evaluateSetupClaude.js'
import { advanceSim, verdictToSignal, claudeVerdictToSignal } from './forwardTest.js'
import type { NewsEvent } from './edge/newsWindow.js'

export const M15_MS = 15 * 60_000
export const H1_MS = 60 * 60_000
export const NEWS_MS = 30 * 60_000

export type SimBlob = {
  state: SimState
  lastProcessedTime: number | null
  claudeState: SimState
  claudeLastProcessedTime: number | null
  m15: Candle[]
  h1: Candle[]
  m15FetchedAt: number | null
  h1FetchedAt: number | null
  news: NewsEvent[]
  newsFetchedAt: number | null
  limitReachedAt: number | null
  updatedAt: number | null
}

export function initBlob(simConfig: SimConfig): SimBlob {
  return {
    state: initialSimState(simConfig),
    lastProcessedTime: null,
    claudeState: initialSimState(simConfig),
    claudeLastProcessedTime: null,
    m15: [],
    h1: [],
    m15FetchedAt: null,
    h1FetchedAt: null,
    news: [],
    newsFetchedAt: null,
    limitReachedAt: null,
    updatedAt: null,
  }
}

/** Due to (re)fetch when never fetched or the interval has elapsed since the last fetch. */
export function isDue(intervalMs: number, fetchedAt: number | null, now: number): boolean {
  return fetchedAt === null || now - fetchedAt >= intervalMs
}

/** Which higher timeframes to fetch this tick (M5 is always fetched). */
export function planFetch(blob: SimBlob, now: number): { m15: boolean; h1: boolean; news: boolean } {
  return {
    m15: isDue(M15_MS, blob.m15FetchedAt, now),
    h1: isDue(H1_MS, blob.h1FetchedAt, now),
    news: isDue(NEWS_MS, blob.newsFetchedAt ?? null, now),
  }
}

/** Advance the sim with freshly fetched M5 + fresh-or-cached M15/H1; refresh caches/timestamps. */
export function applyTick(
  blob: SimBlob,
  fetched: { m5: Candle[]; m15?: Candle[]; h1?: Candle[]; news?: NewsEvent[] },
  config: Config,
  now: number,
): SimBlob {
  const m15 = fetched.m15 ?? blob.m15
  const h1 = fetched.h1 ?? blob.h1
  const news = fetched.news ?? blob.news ?? []
  const ctx: MarketContext = { m5: fetched.m5, m15, h1 }

  const dad = advanceSim(blob.state, blob.lastProcessedTime, ctx, config, (c) =>
    verdictToSignal(evaluateSetup(c, config)),
  )
  const claude = advanceSim(blob.claudeState, blob.claudeLastProcessedTime, ctx, config, (c, t) =>
    claudeVerdictToSignal(evaluateSetupClaude(c, config, t, news)),
  )

  return {
    ...blob,
    state: dad.state,
    lastProcessedTime: dad.lastProcessedTime,
    claudeState: claude.state,
    claudeLastProcessedTime: claude.lastProcessedTime,
    m15,
    h1,
    news,
    newsFetchedAt: fetched.news ? now : blob.newsFetchedAt,
    m15FetchedAt: fetched.m15 ? now : blob.m15FetchedAt,
    h1FetchedAt: fetched.h1 ? now : blob.h1FetchedAt,
    limitReachedAt: null,
    updatedAt: now,
  }
}

/** Record that the provider cut us off; leave state untouched. */
export function applyLimit(blob: SimBlob, now: number): SimBlob {
  return { ...blob, limitReachedAt: now }
}

/** Recognize a Twelve Data credit/rate-limit error payload. */
export function isCreditLimitError(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as { status?: unknown; code?: unknown; message?: unknown }
  if (p.status !== 'error') return false
  if (p.code === 429) return true
  return typeof p.message === 'string' && /credit|limit/i.test(p.message)
}
