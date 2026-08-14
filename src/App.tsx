import { useState } from 'react'
import type { ReactElement } from 'react'
import type { GateResult, MarketContext } from './types'
import { defaultConfig } from './config'
import { score } from './scoring/score'
import { vetoes } from './scoring/vetoes'
import { useMarketData } from './hooks/useMarketData'
import { PHASE1_GATES } from './ui/labels'
import { Score } from './ui/Score'
import { TradeCard } from './ui/TradeCard'
import { VetoList } from './ui/VetoList'
import { Checklist } from './ui/Checklist'

/**
 * Phase-1 checklist state — HONEST.
 *
 * A full live signal needs level identification, which is a Phase-2 gate that
 * does not exist yet. Without an identified level there is no candidate setup,
 * so none of the ten gates can be truthfully evaluated. We therefore emit ten
 * `wait` rows rather than fabricate passes: a false green here is a false
 * trade, and the whole product biases toward WAIT. The same array feeds both the
 * Checklist rows and the Score meter (one source of truth).
 */
function phase1Gates(): GateResult[] {
  return PHASE1_GATES.map((g) => ({
    id: g.id,
    status: 'wait',
    detail: 'Awaiting live setup assembly (level identification, Phase 2).',
  }))
}

/** Last M5 candle time → wall-clock label, or a placeholder if unavailable. */
function updatedLabel(ctx: MarketContext): string {
  const last = ctx.m5[ctx.m5.length - 1]
  if (!last) return '—'
  return new Date(last.time).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  })
}

function toggleTheme(): void {
  const root = document.documentElement
  const current =
    root.getAttribute('data-theme') ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark')
}

function Header({ updated }: { updated?: string }): ReactElement {
  return (
    <header className="flex flex-wrap items-center gap-4 px-0.5 pb-[18px] pt-1.5">
      <div className="mr-auto flex items-center gap-[11px]">
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
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
          Updated {updated} UTC
        </span>
      )}

      <span className="inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface-sunken px-[11px] py-[5px] text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
        </svg>
        Read-only
      </span>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle light or dark theme"
        className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
  const { ctx, loading, error } = useMarketData()
  const [config] = useState(defaultConfig)

  if (!ctx) {
    return (
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto max-w-[1180px] px-4">
          <Header />
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

  const gates = phase1Gates()
  const vetoResults = vetoes(ctx, config)
  const signal = score(gates, vetoResults)
  const verdict =
    'Holding — no candidate setup yet. Live signal assembly (level identification) arrives in ' +
    'Phase 2; until then the checklist reads WAIT and no trade levels are shown. No vetoes active.'

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-[1180px] px-4 pb-14 pt-5">
        <Header updated={updatedLabel(ctx)} />

        {error && (
          <div className="mb-4 rounded-panel border border-fail-bd bg-fail-bg px-4 py-2.5 text-[12.5px] text-fail-fg">
            Live refresh failed ({error.message}). Showing the last good data.
          </div>
        )}

        <Score score={signal} gates={gates} verdict={verdict} total={gates.length} />

        <p className="mb-4 rounded-panel border border-border bg-surface-sunken px-4 py-2.5 text-[12px] text-ink-2">
          <b className="font-semibold text-ink">Phase 1 of 2.</b> Deterministic math is live. Live
          signal assembly — level identification, structure, retest and confirmation — arrives in
          Phase 2, at which point the checklist and trade card fill with a real candidate setup.
        </p>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
          <TradeCard setup={null} />
          <VetoList vetoes={vetoResults} />
        </div>

        <Checklist gates={gates} />
        <Disclaimer />
      </div>
    </main>
  )
}
