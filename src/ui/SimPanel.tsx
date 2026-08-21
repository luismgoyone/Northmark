import type { ReactElement } from 'react'
import type { SimState } from '../sim/types'
import type { SimStats } from '../sim/stats'
import { StatusIcon } from './status'

function credits(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
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
 * forward-test, the open position (if any), and recent trades. Win-rate sits next to Avg R so
 * the number is read honestly. Read-only apart from Reset — no buy/order/execute control.
 */
export function SimPanel({ state, stats, onReset }: { state: SimState; stats: SimStats; onReset: () => void }): ReactElement {
  const up = stats.pnlCredits >= 0
  const rSign = stats.avgR >= 0 ? '+' : '−'
  return (
    <section className="mt-4 rounded-panel border border-border bg-surface shadow-panel" aria-label="Paper trading">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-[18px] py-[15px] pb-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">Paper Trading</h2>
          <span className="rounded-chip border border-build-bd bg-build-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-build-fg">
            Paper · credits, not real money
          </span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] font-semibold text-ink-3 underline underline-offset-2 hover:text-ink"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Balance" value={credits(state.balance)} />
        <Stat label="Win rate" value={stats.trades > 0 ? `${(stats.winRate * 100).toFixed(0)}%` : '—'} />
        <Stat label="Record (W-L)" value={`${stats.wins}-${stats.losses}`} />
        <Stat
          label="Avg R"
          value={stats.trades > 0 ? `${rSign}${Math.abs(stats.avgR).toFixed(2)}R` : '—'}
          tone={stats.trades > 0 ? (stats.avgR >= 0 ? 'up' : 'down') : undefined}
        />
        <Stat
          label="Return"
          value={stats.trades > 0 ? `${signed(Math.round(stats.pnlCredits))} (${up ? '+' : '−'}${Math.abs(stats.returnPct).toFixed(1)}%)` : '—'}
          tone={stats.trades > 0 ? (up ? 'up' : 'down') : undefined}
        />
      </div>

      {state.open && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-[18px] py-3 text-[12.5px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Open</span>
          <span className={`font-semibold ${state.open.direction === 'long' ? 'text-pass-fg' : 'text-fail-fg'}`}>
            {state.open.direction === 'long' ? '▲ LONG' : '▼ SHORT'}
          </span>
          <span className="font-mono text-ink-2">
            entry {state.open.entry} · SL {state.open.sl} · TP {state.open.tp}
          </span>
        </div>
      )}

      <div className="px-[14px] py-2 pb-[14px]">
        {state.trades.length === 0 ? (
          <p className="m-0 px-1.5 py-3 text-[12.5px] text-ink-2">
            No paper trades yet. When a setup authorizes in Live mode, Northmark opens one
            automatically.
          </p>
        ) : (
          [...state.trades]
            .slice(-8)
            .reverse()
            .map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-1.5 py-2 last:border-b-0"
              >
                <StatusIcon status={t.result === 'win' ? 'pass' : 'fail'} size={20} />
                <span className="font-mono text-[12.5px] text-ink-2">
                  {t.direction === 'long' ? 'LONG' : 'SHORT'} · {t.exitReason.toUpperCase()} @ {t.exit}
                </span>
                <span
                  className={`font-mono text-[12.5px] font-semibold tabular-nums ${
                    t.result === 'win' ? 'text-pass-fg' : 'text-fail-fg'
                  }`}
                >
                  {t.rMultiple >= 0 ? '+' : '−'}
                  {Math.abs(t.rMultiple).toFixed(0)}R · {signed(Math.round(t.pnlCredits))}
                </span>
              </div>
            ))
        )}
      </div>
    </section>
  )
}
