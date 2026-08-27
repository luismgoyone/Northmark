import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Config, MarketContext } from './types'
import { defaultConfig } from './config'
import { evaluateSetup, type SetupVerdict } from './scoring/evaluateSetup'
import { evaluateSetupClaude } from './scoring/evaluateSetupClaude'
import { useMarketData } from './hooks/useMarketData'
import { useServerSim } from './hooks/useServerSim'
import { DEMO_PRESETS, type Mode } from './demo/presets'
import { PriceTicker } from './ui/PriceTicker'
import { Score } from './ui/Score'
import { TradeCard, type TradeSetup } from './ui/TradeCard'
import { VetoList } from './ui/VetoList'
import { Checklist } from './ui/Checklist'
import { PriceChart } from './ui/PriceChart'
import { DemoSwitch } from './ui/DemoSwitch'
import { DemoBanner } from './ui/DemoBanner'
import { SimPanel } from './ui/SimPanel'
import { Tabs, type TabDef } from './ui/Tabs'
import { StrategySection } from './ui/StrategySection'
import { ClaudeSignal } from './ui/edge/ClaudeSignal'
import { ClaudeChecklist } from './ui/edge/ClaudeChecklist'

type TabKey = 'signal' | 'chart' | 'paper' | 'checklist'
const TABS: TabDef[] = [
  { key: 'signal', label: 'Signal' },
  { key: 'chart', label: 'Chart' },
  { key: 'paper', label: 'Paper' },
  { key: 'checklist', label: 'Checklist' },
]

/**
 * Build the TradeCard model from an authorized verdict. Entry/sl/tp1/tp2/lot
 * come straight from the engine; the rest (risk $, R:R ratios) are derived
 * from config + direction-aware distances. `provisional: false` because an
 * authorized setup (every required gate passed) is confirmed, not building.
 */
function toTradeSetup(v: Extract<SetupVerdict, { status: 'setup' }>, config: Config): TradeSetup {
  const isLong = v.direction === 'long'
  const risk = isLong ? v.entry - v.sl : v.sl - v.entry
  const reward1 = isLong ? v.tp1 - v.entry : v.entry - v.tp1
  const reward2 = isLong ? v.tp2 - v.entry : v.entry - v.tp2
  return {
    direction: v.direction,
    entry: v.entry,
    sl: v.sl,
    tp1: v.tp1,
    tp2: v.tp2,
    lot: v.lot,
    riskDollars: config.accountSize * config.riskPct,
    riskPct: config.riskPct,
    rr1: risk > 0 ? reward1 / risk : 0,
    rr2: risk > 0 ? reward2 / risk : 0,
    minRR: config.minRR,
    provisional: false,
  }
}

/** Last M5 candle time → Philippine-time (Asia/Manila, UTC+8) wall-clock label. */
function updatedLabel(ctx: MarketContext): string {
  const last = ctx.m5[ctx.m5.length - 1]
  if (!last) return '—'
  return new Date(last.time).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

function toggleTheme(): void {
  const root = document.documentElement
  const current =
    root.getAttribute('data-theme') ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark')
}

function Header({
  updated,
  mode,
  onModeChange,
}: {
  updated?: string
  mode: Mode
  onModeChange: (m: Mode) => void
}): ReactElement {
  return (
    <header className="flex flex-wrap items-center gap-4 px-0.5 pb-[18px] pt-1.5">
      <div className="mr-auto flex items-center gap-[11px]">
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" aria-hidden="true">
          <circle cx="16" cy="16" r="14.5" stroke="var(--border-strong)" strokeWidth="1" />
          <path d="M16 3.5 L19 16 L16 28.5 L13 16 Z" fill="var(--brand)" />
          <path d="M3.5 16 L16 13.4 L28.5 16 L16 18.6 Z" fill="var(--ink-3)" opacity="0.5" />
          <circle cx="16" cy="16" r="2" fill="var(--ink)" />
        </svg>
        <span className="text-[18px] font-bold tracking-[-0.01em]">Northmark</span>
        <span className="h-[22px] w-px bg-border-strong" />
        <span className="font-mono text-[12.5px] text-ink-2">XAU/USD · M5</span>
      </div>

      {updated && (
        <span className="inline-flex items-center gap-[7px] font-mono text-[12.5px] text-ink-2">
          <span className="h-2 w-2 animate-live-dot rounded-full bg-pass-fg motion-reduce:animate-none" />
          Updated {updated} PHT
        </span>
      )}

      <span className="inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface-sunken px-[11px] py-[5px] text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
        </svg>
        Read-only
      </span>

      <DemoSwitch value={mode} onChange={onModeChange} />

      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle light or dark theme"
        className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </header>
  )
}

function Disclaimer(): ReactElement {
  return (
    <footer className="mt-[22px] rounded-panel border border-dashed border-border-strong bg-surface-sunken px-[18px] py-4 text-center text-[12px] text-ink-3">
      <b className="font-semibold text-ink-2">Read-only decision support.</b> Northmark scans and
      scores your checklist — it never places orders, holds funds, or auto-trades. You place the
      trade in your own broker. Not financial advice.
      <span className="mt-1.5 block text-[10.5px] tracking-[0.04em] text-ink-3/70">v{__APP_VERSION__}</span>
    </footer>
  )
}

function CenteredPanel({ children }: { children: ReactElement }): ReactElement {
  return (
    <div className="mx-auto grid min-h-[40vh] max-w-[1180px] place-items-center px-4 py-16">
      <div className="rounded-panel border border-border bg-surface px-8 py-10 text-center shadow-panel">
        {children}
      </div>
    </div>
  )
}

export default function App(): ReactElement {
  const [mode, setMode] = useState<Mode>('live')
  const { ctx, loading, error } = useMarketData(mode === 'live')
  const [config] = useState(defaultConfig)
  const [tab, setTab] = useState<TabKey>('signal')

  const demoPreset = mode === 'live' ? null : DEMO_PRESETS.find((p) => p.id === mode) ?? null
  const activeCtx = demoPreset ? demoPreset.ctx : ctx
  const activeConfig = demoPreset?.config ?? config

  // Compute the verdict once (null while live data loads) for the rest of the UI. The
  // paper-trading sim is a read-only view of the shared server record — it must run on every
  // render, so it sits above the loading early-return below.
  const verdict = activeCtx ? evaluateSetup(activeCtx, activeConfig) : null
  // The Claude engine runs on the same candle: last M5 close is `now`, empty events in Phase 1.
  const now = activeCtx?.m5[activeCtx.m5.length - 1]?.time ?? 0
  const claudeVerdict = activeCtx ? evaluateSetupClaude(activeCtx, activeConfig, now, []) : null
  const sim = useServerSim()

  if (mode === 'live' && !activeCtx) {
    return (
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto max-w-[1180px] px-4">
          <Header mode={mode} onModeChange={setMode} />
        </div>
        {loading ? (
          <CenteredPanel>
            <>
              <div className="text-[14px] font-semibold text-ink">Loading market data…</div>
              <p className="m-0 mt-1.5 text-[12.5px] text-ink-2">
                Fetching XAU/USD candles (M5 · M15 · H1).
              </p>
            </>
          </CenteredPanel>
        ) : (
          <CenteredPanel>
            <>
              <div className="text-[14px] font-semibold text-fail-fg">Market data unavailable</div>
              <p className="m-0 mt-1.5 max-w-[46ch] text-[12.5px] text-ink-2">
                {error?.message ?? 'The data provider could not be reached.'} The screen will fill
                once candles load — no trade levels are shown without live data.
              </p>
            </>
          </CenteredPanel>
        )}
      </main>
    )
  }

  const ctxForRender = activeCtx as MarketContext
  const result = verdict as SetupVerdict
  const gates = result.gates
  const vetoResults = result.vetoes
  const signal = result.score
  const verdictText =
    result.status === 'setup'
      ? `${result.direction.toUpperCase()} setup authorized — all required gates passed. Entry ${result.entry}, SL ${result.sl}.`
      : `Holding — first unmet gate: ${result.blockedBy}. Bias toward WAIT.`
  const tradeSetup: TradeSetup | null =
    result.status === 'setup' ? toTradeSetup(result, activeConfig) : null

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-[1180px] px-4 pb-14 pt-5">
        <Header updated={updatedLabel(ctxForRender)} mode={mode} onModeChange={setMode} />

        {mode !== 'live' && <DemoBanner onExit={() => setMode('live')} />}

        {mode === 'live' && error && (
          <div className="mb-4 rounded-panel border border-fail-bd bg-fail-bg px-4 py-2.5 text-[12.5px] text-fail-fg">
            Live refresh failed ({error.message}). Showing the last good data.
          </div>
        )}

        {/* Pinned summary: current price + verdict, always above the tabs. */}
        <div className="mb-4 overflow-hidden rounded-panel border border-border bg-surface shadow-panel">
          <PriceTicker ctx={ctxForRender} />
          <Score score={signal} gates={gates} verdict={verdictText} total={gates.length} supporting={result.supporting} />
        </div>

        <Tabs tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />

        <div role="tabpanel">
          {tab === 'signal' && (
            <>
              <p className="mb-4 rounded-panel border border-border bg-surface-sunken px-4 py-2.5 text-[12px] text-ink-2">
                {demoPreset ? (
                  <>
                    <b className="font-semibold text-ink">Demo signal assembly.</b> This checklist
                    and trade card are computed by the same engine, run on the illustrative preset
                    above — not on real candles.
                  </>
                ) : (
                  <>
                    <b className="font-semibold text-ink">Live signal assembly is active.</b>{' '}
                    Structure, level, breakout, retest, and confirmation are evaluated on real
                    candles. The trade card fills only when a real candidate setup forms — expect
                    WAIT most of the time.
                  </>
                )}
              </p>
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <StrategySection engine="dad" subtitle="verbatim 13-step">
                  <div className="grid grid-cols-1 items-start gap-4">
                    <TradeCard setup={tradeSetup} />
                    <VetoList vetoes={vetoResults} />
                  </div>
                </StrategySection>
                <StrategySection engine="claude" subtitle="my criteria">
                  {claudeVerdict ? (
                    <ClaudeSignal verdict={claudeVerdict} />
                  ) : (
                    <p className="text-[12.5px] text-ink-3">Waiting for candles…</p>
                  )}
                </StrategySection>
              </div>
            </>
          )}

          {tab === 'chart' && (
            <PriceChart ctx={ctxForRender} emaPeriod={activeConfig.ema.period} stoch={activeConfig.stoch} />
          )}

          {tab === 'paper' &&
            (mode === 'live' ? (
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <StrategySection engine="dad" subtitle="verbatim 13-step">
                  <SimPanel state={sim.state} stats={sim.stats} meta={sim.meta} />
                </StrategySection>
                <StrategySection engine="claude" subtitle="my criteria">
                  <SimPanel state={sim.claudeState} stats={sim.claudeStats} meta={sim.meta} />
                </StrategySection>
              </div>
            ) : (
              <div className="rounded-panel border border-border bg-surface px-[18px] py-8 text-center text-[12.5px] text-ink-2 shadow-panel">
                Paper trading records the shared <b className="text-ink">Live</b> forward-test. Switch to Live
                to view it.
              </div>
            ))}

          {tab === 'checklist' && (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              <StrategySection engine="dad" subtitle="verbatim 13-step">
                <Checklist gates={gates} />
              </StrategySection>
              <StrategySection engine="claude" subtitle="my criteria">
                <ClaudeChecklist />
              </StrategySection>
            </div>
          )}
        </div>

        <Disclaimer />
      </div>
    </main>
  )
}
