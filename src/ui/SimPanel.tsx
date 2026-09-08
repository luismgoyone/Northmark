import { useState, type ReactElement } from 'react'
import type { SimState } from '../sim/types'
import type { SimStats } from '../sim/stats'
import type { SimMeta } from '../hooks/useServerSim'
import { StatusIcon } from './status'
import { fmtPhtDateTime } from './format'

function usd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function signedUsd(n: number): string {
  return `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`
}
function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtLot(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n >= 0.1 ? 2 : 3 })
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }): ReactElement {
  const color = tone === 'up' ? 'text-pass-fg' : tone === 'down' ? 'text-fail-fg' : 'text-ink'
  return (
    <div className="bg-surface-raised px-[13px] py-3">
      <div className="mb-[5px] text-[10.5px] uppercase tracking-[0.07em] text-ink-3">{label}</div>
      <div className={`font-mono text-[17px] font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

/**
 * The paper-trading panel: a running credit balance + win-rate + record + avg R over the
 * shared, server-driven forward-test, the open position (if any), and recent trades. Win-rate
 * sits next to Avg R so the number is read honestly. Read-only — no reset (reset is
 * admin-only) and no buy/order/execute control.
 */
export function SimPanel({
  state,
  stats,
  meta,
}: {
  state: SimState
  stats: SimStats
  meta: SimMeta
}): ReactElement {
  const up = stats.pnlCredits >= 0
  const rSign = stats.avgR >= 0 ? '+' : '−'
  const showLimit = meta.limitReachedAt !== null && meta.limitReachedAt > (meta.updatedAt ?? 0)
  // Paginate the full trade history newest-first (8/page) so every trade is reachable, not just the latest.
  const PAGE_SIZE = 8
  const [page, setPage] = useState(0)
  const ordered = [...state.trades].reverse()
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1) // clamp if the count shrank (e.g. a reset)
  const start = safePage * PAGE_SIZE
  const shown = ordered.slice(start, start + PAGE_SIZE)
  return (
    <section className="mt-4 rounded-panel border border-border bg-surface shadow-panel" aria-label="Paper trading">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-[18px] py-[15px] pb-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">Paper Trading</h2>
          <span className="rounded-chip border border-build-bd bg-build-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-build-fg">
            Paper · USD, not real money
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Balance" value={usd(state.balance)} />
        <Stat label="Win rate" value={stats.trades > 0 ? `${(stats.winRate * 100).toFixed(0)}%` : '—'} />
        <Stat label="Record (W-L)" value={`${stats.wins}-${stats.losses}`} />
        <Stat
          label="Avg R"
          value={stats.trades > 0 ? `${rSign}${Math.abs(stats.avgR).toFixed(2)}R` : '—'}
          tone={stats.trades > 0 ? (stats.avgR >= 0 ? 'up' : 'down') : undefined}
        />
        <Stat
          label="Return"
          value={stats.trades > 0 ? `${signedUsd(stats.pnlCredits)} (${up ? '+' : '−'}${Math.abs(stats.returnPct).toFixed(1)}%)` : '—'}
          tone={stats.trades > 0 ? (up ? 'up' : 'down') : undefined}
        />
      </div>

      {state.open && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-[18px] py-3 text-[12.5px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Open</span>
          <span className={`font-semibold ${state.open.direction === 'long' ? 'text-pass-fg' : 'text-fail-fg'}`}>
            {state.open.direction === 'long' ? '▲ LONG' : '▼ SHORT'}
          </span>
          {state.open.grade && (
            <span
              className="rounded-chip border border-brand/50 bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand"
              aria-label={`grade ${state.open.grade}`}
            >
              {state.open.grade}
            </span>
          )}
          <span className="font-mono text-ink-2">
            entry {fmt(state.open.entry)} · SL {fmt(state.open.sl)} · TP {fmt(state.open.tp)} · lot{' '}
            {fmtLot(state.open.lot)} · risk {usd(state.open.riskCredits)}
          </span>
          <span className="font-mono text-ink-3">opened {fmtPhtDateTime(state.open.openedAtTime)} PHT</span>
        </div>
      )}

      {showLimit && meta.limitReachedAt !== null && (
        <div className="border-t border-border bg-build-bg px-[18px] py-2.5 text-[12px] text-build-fg">
          Data limit reached at {fmtPhtDateTime(meta.limitReachedAt)} PHT — updates resume after the
          provider's daily reset.
        </div>
      )}

      <div className="px-[14px] py-2 pb-[14px]">
        {state.trades.length === 0 ? (
          <p className="m-0 px-1.5 py-3 text-[12.5px] text-ink-2">
            No paper trades yet. When a setup authorizes in Live mode, Northmark opens one
            automatically.
          </p>
        ) : (
          <>
            {shown.map((t) => (
              <div key={t.id} className="border-b border-border px-1.5 py-2.5 last:border-b-0">
                <div className="flex items-center gap-2.5">
                  <StatusIcon status={t.result === 'win' ? 'pass' : 'fail'} size={20} />
                  <span className="sr-only">{t.result}</span>
                  <span className={`text-[12.5px] font-semibold ${t.direction === 'long' ? 'text-pass-fg' : 'text-fail-fg'}`}>
                    {t.direction === 'long' ? 'LONG' : 'SHORT'}
                  </span>
                  {t.grade && (
                    <span
                      className="rounded-chip border border-brand/50 bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand"
                      aria-label={`grade ${t.grade}`}
                    >
                      {t.grade}
                    </span>
                  )}
                  <span className="font-mono text-[12px] text-ink-2">
                    entry {fmt(t.entry)} · SL {fmt(t.sl)} · TP {fmt(t.tp)} → {t.exitReason.toUpperCase()} @ {fmt(t.exit)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 pl-[30px] font-mono text-[11.5px] text-ink-3">
                  <span className={t.result === 'win' ? 'text-pass-fg' : 'text-fail-fg'}>
                    {t.rMultiple >= 0 ? '+' : '−'}
                    {Math.abs(t.rMultiple).toFixed(1)}R · {signedUsd(t.pnlCredits)}
                  </span>
                  <span>
                    lot {fmtLot(t.lot)} · risk {usd(t.riskCredits)}
                  </span>
                  <span>
                    opened {fmtPhtDateTime(t.openedAtTime)} → closed {fmtPhtDateTime(t.closedAtTime)} PHT
                  </span>
                </div>
              </div>
            ))}
            {pageCount > 1 && (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 px-1.5 pt-3 text-[11.5px] text-ink-3">
                <span className="tabular-nums">
                  Page {safePage + 1} of {pageCount} · trades {start + 1}–{Math.min(start + PAGE_SIZE, ordered.length)} of{' '}
                  {ordered.length}
                </span>
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(0, safePage - 1))}
                    disabled={safePage === 0}
                    className="rounded-[6px] border border-border px-2.5 py-1 font-semibold text-ink-2 transition-colors enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ‹ Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="rounded-[6px] border border-border px-2.5 py-1 font-semibold text-ink-2 transition-colors enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next ›
                  </button>
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
